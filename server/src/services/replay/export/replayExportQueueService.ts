import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import type { ReplayExportRange } from "@rybbit/shared";
import { Job, Queue, Worker } from "bullmq";
import { nanoid } from "nanoid";

import { createServiceLogger } from "../../../lib/logger/logger.js";
import { ReplayExportCancelledError, ReplayExportRenderer } from "./replayExportRenderer.js";
import type {
  ReplayExportJobData,
  ReplayExportResult,
  ReplayExportStatus,
} from "./replayExportTypes.js";

const QUEUE_NAME = "session-replay-exports";
const EXPORT_TTL_MS = 60 * 60 * 1000;
const MAX_ACTIVE_EXPORTS_PER_USER = 3;

class ReplayExportQueueService {
  private queue: Queue<ReplayExportJobData, ReplayExportResult>;
  private worker: Worker<ReplayExportJobData, ReplayExportResult> | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private initialized = false;
  private logger = createServiceLogger("replay-export-queue");
  private outputDirectory = process.env.REPLAY_EXPORT_DIR || join(process.cwd(), "tmp", "replay-exports");
  private connection = {
    host: process.env.REDIS_HOST || "localhost",
    port: Number.parseInt(process.env.REDIS_PORT || "6379", 10),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  };

  constructor() {
    this.queue = new Queue<ReplayExportJobData, ReplayExportResult>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 2 * 60 * 60, count: 200 },
        removeOnFail: { age: 2 * 60 * 60, count: 200 },
      },
    });
  }

  async initialize() {
    if (this.initialized) return;
    await mkdir(this.outputDirectory, { recursive: true });
    await this.cleanupExpiredFiles();
    await this.queue.setGlobalConcurrency(1);
    this.worker = new Worker<ReplayExportJobData, ReplayExportResult>(QUEUE_NAME, async job => this.processJob(job), {
      connection: this.connection,
      concurrency: 1,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error({ error, exportId: job?.id }, "Replay export job failed");
    });
    await Promise.all([this.queue.waitUntilReady(), this.worker.waitUntilReady()]);
    this.cleanupTimer = setInterval(() => void this.cleanupExpiredFiles(), 15 * 60 * 1000);
    this.cleanupTimer.unref();
    this.initialized = true;
    this.logger.info({ outputDirectory: this.outputDirectory }, "Replay export queue initialized");
  }

  async shutdown() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    await Promise.all([this.worker?.close(), this.queue.close()]);
    this.worker = null;
    this.initialized = false;
  }

  async createExport(
    siteId: number,
    sessionId: string,
    requestedBy: string,
    options: ReplayExportRange
  ): Promise<string> {
    const jobs = await this.queue.getJobs(["waiting", "active", "delayed"]);
    const userJobCount = jobs.filter(job => job.data.requestedBy === requestedBy).length;
    if (userJobCount >= MAX_ACTIVE_EXPORTS_PER_USER) {
      throw new Error("Too many replay exports are already queued for this user");
    }

    const exportId = nanoid(18);
    await this.queue.add("render-replay", { siteId, sessionId, requestedBy, options }, { jobId: exportId });
    return exportId;
  }

  async getStatus(exportId: string, siteId: number, requestedBy: string): Promise<ReplayExportStatus | null> {
    const job = await this.getAuthorizedJob(exportId, siteId, requestedBy);
    if (!job) return null;
    const state = await job.getState();
    const progress = typeof job.progress === "number" ? job.progress : 0;

    if (job.data.cancelRequested || state === "unknown") {
      return { exportId, state: "cancelled", progress };
    }
    if (state === "completed" && job.returnvalue) {
      return {
        exportId,
        state: "ready",
        progress: 100,
        filename: job.returnvalue.filename,
        sizeBytes: job.returnvalue.sizeBytes,
        expiresAt: job.returnvalue.expiresAt,
      };
    }
    if (state === "failed") {
      return { exportId, state: "failed", progress, error: job.failedReason || "Replay export failed" };
    }
    if (state === "active") {
      return { exportId, state: progress >= 75 ? "packaging" : "rendering", progress };
    }
    return { exportId, state: "queued", progress };
  }

  async getResult(exportId: string, siteId: number, requestedBy: string): Promise<ReplayExportResult | null> {
    const job = await this.getAuthorizedJob(exportId, siteId, requestedBy);
    if (!job || (await job.getState()) !== "completed" || !job.returnvalue) return null;
    if (new Date(job.returnvalue.expiresAt).getTime() <= Date.now()) {
      await rm(job.returnvalue.filePath, { force: true });
      return null;
    }
    return job.returnvalue;
  }

  async cancelExport(exportId: string, siteId: number, requestedBy: string): Promise<boolean> {
    const job = await this.getAuthorizedJob(exportId, siteId, requestedBy);
    if (!job) return false;
    const state = await job.getState();
    if (["waiting", "delayed", "waiting-children"].includes(state)) {
      await job.remove();
      return true;
    }
    if (state === "active") {
      await job.updateData({ ...job.data, cancelRequested: true });
      return true;
    }
    return false;
  }

  private async processJob(job: Job<ReplayExportJobData, ReplayExportResult>): Promise<ReplayExportResult> {
    const renderer = new ReplayExportRenderer();
    try {
      return await renderer.render(
        job.data,
        this.outputDirectory,
        progress => job.updateProgress(progress),
        async () => (await this.queue.getJob(String(job.id)))?.data.cancelRequested === true
      );
    } catch (error) {
      if (error instanceof ReplayExportCancelledError) {
        await job.updateData({ ...job.data, cancelRequested: true });
      }
      throw error;
    }
  }

  private async getAuthorizedJob(exportId: string, siteId: number, requestedBy: string) {
    const job = await this.queue.getJob(exportId);
    if (!job || job.data.siteId !== siteId || job.data.requestedBy !== requestedBy) return null;
    return job;
  }

  private async cleanupExpiredFiles() {
    const files = await readdir(this.outputDirectory).catch(() => []);
    await Promise.all(
      files.map(async filename => {
        const filePath = join(this.outputDirectory, filename);
        const fileStats = await stat(filePath).catch(() => null);
        if (fileStats && Date.now() - fileStats.mtimeMs > EXPORT_TTL_MS) {
          await rm(filePath, { force: true });
        }
      })
    );
  }
}

export const replayExportQueueService = new ReplayExportQueueService();
