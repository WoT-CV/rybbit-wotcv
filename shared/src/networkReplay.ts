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
