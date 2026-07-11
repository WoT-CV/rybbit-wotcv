import { DEFAULT_NETWORK_REPLAY_CONFIG, type NetworkReplayConfig } from "@rybbit/shared";

export { DEFAULT_NETWORK_REPLAY_CONFIG } from "@rybbit/shared";

export function normalizeNetworkReplayConfig(config?: Partial<NetworkReplayConfig> | null): NetworkReplayConfig {
  return {
    ...DEFAULT_NETWORK_REPLAY_CONFIG,
    ...config,
  };
}
