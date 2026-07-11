import { DEFAULT_NETWORK_REPLAY_CONFIG, type NetworkReplayConfig } from "@rybbit/shared";
import { z } from "zod";

export { DEFAULT_NETWORK_REPLAY_CONFIG } from "@rybbit/shared";

export const networkReplayConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    captureFetch: z.boolean().optional(),
    captureXhr: z.boolean().optional(),
    capturePerformanceResources: z.boolean().optional(),
    captureInitialPerformanceResources: z.boolean().optional(),
    captureRequestHeaders: z.boolean().optional(),
    captureResponseHeaders: z.boolean().optional(),
    captureRequestBody: z.boolean().optional(),
    captureResponseBody: z.boolean().optional(),
    maxBodySizeBytes: z.number().int().min(1).max(5_000_000).optional(),
    bodyReadTimeoutMs: z.number().int().min(100).max(10_000).optional(),
    maxNetworkEventSizeBytes: z.number().int().min(1).max(9_000_000).optional(),
    maxReplayBatchSizeBytes: z.number().int().min(1).max(9_000_000).optional(),
  })
  .strict();

export type NetworkReplayConfigUpdate = z.infer<typeof networkReplayConfigSchema>;

export function normalizeNetworkReplayConfig(config?: Partial<NetworkReplayConfig> | null): NetworkReplayConfig {
  return {
    ...DEFAULT_NETWORK_REPLAY_CONFIG,
    ...config,
  };
}

export function resolveNetworkReplayConfig(
  currentConfig: Partial<NetworkReplayConfig> | null | undefined,
  update: NetworkReplayConfigUpdate | undefined,
  sessionReplayEnabled: boolean,
  siteType: "web" | "mobile"
): NetworkReplayConfig {
  const config = normalizeNetworkReplayConfig({
    ...normalizeNetworkReplayConfig(currentConfig),
    ...update,
  });

  return siteType === "mobile" || !sessionReplayEnabled ? { ...config, enabled: false } : config;
}

export function getNetworkReplayConfigError(config: NetworkReplayConfig): string | null {
  if (config.maxBodySizeBytes > config.maxNetworkEventSizeBytes) {
    return "Network Replay body limit cannot exceed the event limit";
  }
  if (config.maxNetworkEventSizeBytes > config.maxReplayBatchSizeBytes) {
    return "Network Replay event limit cannot exceed the replay batch limit";
  }
  return null;
}
