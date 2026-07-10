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
  schemaVersion: 1;
  requestId: string;
  currentUrl: string;
  url: string;
  method: string;
  initiatorType: string;
  startedAt: number;
  completedAt?: number;
  durationMs: number;
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

export interface ParsedNetworkRequest extends CapturedNetworkRequest {
  startOffset: number;
  endOffset: number;
}

export interface ReplayEventLike {
  timestamp: number;
  type: string | number;
  data?: unknown;
}

export type NetworkStatusGroup = "all" | "errors" | "2xx" | "3xx" | "4xx" | "5xx";

export interface NetworkRequestFilters {
  query: string;
  method: string;
  statusGroup: NetworkStatusGroup;
  initiatorType: string;
  fetchXhrOnly: boolean;
  minDurationMs: number;
}
