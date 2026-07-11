export interface ReplayExportOptions {
  startMs: number;
  endMs: number;
  captureMs: number;
  skipInactivity: boolean;
  includeNetwork: boolean;
  includeBodies: boolean;
  playbackSpeed: 1 | 2 | 4;
}

export interface ReplayExportJobData {
  siteId: number;
  sessionId: string;
  requestedBy: string;
  options: ReplayExportOptions;
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
