import type { NetworkReplayConfig } from "@rybbit/shared";

export const DEFAULT_NETWORK_REPLAY_CONFIG: NetworkReplayConfig = {
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
};

export function normalizeNetworkReplayConfig(config: unknown): NetworkReplayConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return DEFAULT_NETWORK_REPLAY_CONFIG;
  }

  return {
    ...DEFAULT_NETWORK_REPLAY_CONFIG,
    ...(config as Partial<NetworkReplayConfig>),
    enabled: (config as Partial<NetworkReplayConfig>).enabled === true,
  };
}
