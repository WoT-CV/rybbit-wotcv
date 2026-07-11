import { DEFAULT_NETWORK_REPLAY_CONFIG, type NetworkReplayConfig } from "@rybbit/shared";

export { DEFAULT_NETWORK_REPLAY_CONFIG } from "@rybbit/shared";

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
