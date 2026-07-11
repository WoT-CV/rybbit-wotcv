import { createReadStream } from "node:fs";

import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { replayExportQueueService } from "../../services/replay/export/replayExportQueueService.js";

const exportOptionsSchema = z
  .object({
    startMs: z.number().finite().min(0),
    endMs: z.number().finite().positive(),
    skipInactivity: z.boolean().default(true),
    playbackSpeed: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(1),
  })
  .refine(value => value.endMs > value.startMs, { message: "Export end must be after export start" })
  .refine(value => value.endMs - value.startMs <= 2 * 60_000, {
    message: "Replay export range cannot exceed 2 minutes",
  });

type ReplayExportParams = { siteId: string; sessionId: string };
type ReplayExportIdParams = ReplayExportParams & { exportId: string };

export async function createReplayExport(
  request: FastifyRequest<{ Params: ReplayExportParams; Body: unknown }>,
  reply: FastifyReply
) {
  const parsed = exportOptionsSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid replay export options" });
  }

  const userId = request.user?.id;
  if (!userId) return reply.status(401).send({ error: "Authentication required" });

  try {
    const exportId = await replayExportQueueService.createExport(
      Number(request.params.siteId),
      request.params.sessionId,
      userId,
      parsed.data
    );
    return reply.status(202).send({ exportId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not queue replay export";
    return reply.status(message.startsWith("Too many") ? 429 : 500).send({ error: message });
  }
}

export async function getReplayExportStatus(
  request: FastifyRequest<{ Params: ReplayExportIdParams }>,
  reply: FastifyReply
) {
  const userId = request.user?.id;
  if (!userId) return reply.status(401).send({ error: "Authentication required" });
  const status = await replayExportQueueService.getStatus(
    request.params.exportId,
    Number(request.params.siteId),
    userId
  );
  return status ? reply.send(status) : reply.status(404).send({ error: "Replay export not found" });
}

export async function downloadReplayExport(
  request: FastifyRequest<{ Params: ReplayExportIdParams }>,
  reply: FastifyReply
) {
  const userId = request.user?.id;
  if (!userId) return reply.status(401).send({ error: "Authentication required" });
  const result = await replayExportQueueService.getResult(
    request.params.exportId,
    Number(request.params.siteId),
    userId
  );
  if (!result) return reply.status(404).send({ error: "Replay export is unavailable or expired" });

  reply.header("Content-Type", "application/zip");
  reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
  reply.header("Content-Length", String(result.sizeBytes));
  return reply.send(createReadStream(result.filePath));
}

export async function cancelReplayExport(
  request: FastifyRequest<{ Params: ReplayExportIdParams }>,
  reply: FastifyReply
) {
  const userId = request.user?.id;
  if (!userId) return reply.status(401).send({ error: "Authentication required" });
  const cancelled = await replayExportQueueService.cancelExport(
    request.params.exportId,
    Number(request.params.siteId),
    userId
  );
  return cancelled
    ? reply.send({ success: true })
    : reply.status(409).send({ error: "Replay export cannot be cancelled" });
}
