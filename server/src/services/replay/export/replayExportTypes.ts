import type { ReplayExportRange } from "@rybbit/shared";

export interface ReplayExportJobData {
  siteId: number;
  sessionId: string;
  requestedBy: string;
  options: ReplayExportRange;
  cancelRequested?: boolean;
}

export interface ReplayExportResult {
  filePath: string;
  filename: string;
  sizeBytes: number;
  expiresAt: string;
}

export type ReplayExportState = "queued" | "rendering" | "packaging" | "ready" | "failed" | "cancelled";

export interface ReplayExportStatus {
  exportId: string;
  state: ReplayExportState;
  progress: number;
  filename?: string;
  sizeBytes?: number;
  expiresAt?: string;
  error?: string;
}
