export interface NetworkReplayConfig {
  enabled: boolean;
  captureFetch: boolean;
  captureXhr: boolean;
  capturePerformanceResources: boolean;
  captureInitialPerformanceResources: boolean;
  captureRequestHeaders: boolean;
  captureResponseHeaders: boolean;
  captureRequestBody: boolean;
  captureResponseBody: boolean;
  maxBodySizeBytes: number;
  bodyReadTimeoutMs: number;
  maxNetworkEventSizeBytes: number;
  maxReplayBatchSizeBytes: number;
}

export const NETWORK_REPLAY_SCHEMA_VERSION = 1 as const;

export const DEFAULT_NETWORK_REPLAY_CONFIG = {
  enabled: false,
  captureFetch: true,
  captureXhr: true,
  capturePerformanceResources: true,
  captureInitialPerformanceResources: true,
  captureRequestHeaders: true,
  captureResponseHeaders: true,
  captureRequestBody: true,
  captureResponseBody: true,
  maxBodySizeBytes: 1_000_000,
  bodyReadTimeoutMs: 1_000,
  maxNetworkEventSizeBytes: 2_500_000,
  maxReplayBatchSizeBytes: 7_000_000,
} satisfies NetworkReplayConfig;

export type NetworkOutcome = "success" | "http_error" | "network_error" | "aborted" | "timeout" | "pending_on_unload";

export type CapturedBodyKind =
  | "empty"
  | "text"
  | "json"
  | "form-data"
  | "url-search-params"
  | "blob-metadata"
  | "array-buffer-metadata"
  | "stream-unavailable"
  | "binary-unavailable"
  | "unreadable"
  | "too-large"
  | "timeout";

export interface CapturedBody {
  kind: CapturedBodyKind;
  value?: string;
  contentType?: string;
  sizeBytes?: number;
  truncated?: boolean;
  reason?: string;
}

export interface CapturedNetworkTiming {
  startTime?: number;
  fetchStart?: number;
  domainLookupStart?: number;
  domainLookupEnd?: number;
  connectStart?: number;
  secureConnectionStart?: number;
  connectEnd?: number;
  requestStart?: number;
  responseStart?: number;
  responseEnd?: number;
  duration?: number;
}

export interface CapturedNetworkSizes {
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
}

export interface CapturedNetworkError {
  name?: string;
  message?: string;
  stack?: string;
}

export interface CapturedNetworkRequest {
  schemaVersion: typeof NETWORK_REPLAY_SCHEMA_VERSION;
  requestId: string;
  currentUrl: string;
  url: string;
  method: string;
  initiatorType: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status?: number;
  statusText?: string;
  outcome: NetworkOutcome;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: CapturedBody;
  responseBody?: CapturedBody;
  timing?: CapturedNetworkTiming;
  sizes?: CapturedNetworkSizes;
  error?: CapturedNetworkError;
  performanceEntryFound: boolean;
  bodyCaptureCompletedAt?: number;
}
