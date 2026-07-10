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
