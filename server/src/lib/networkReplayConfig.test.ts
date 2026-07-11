import { describe, expect, it } from "vitest";

import {
  DEFAULT_NETWORK_REPLAY_CONFIG,
  getNetworkReplayConfigError,
  networkReplayConfigSchema,
  resolveNetworkReplayConfig,
} from "./networkReplayConfig.js";

describe("networkReplayConfig", () => {
  it("merges a partial update without losing defaults", () => {
    expect(resolveNetworkReplayConfig(null, { enabled: true, captureXhr: false }, true, "web")).toEqual({
      ...DEFAULT_NETWORK_REPLAY_CONFIG,
      enabled: true,
      captureXhr: false,
    });
  });

  it.each([
    [false, "web" as const],
    [true, "mobile" as const],
  ])("disables network replay when session replay or site type disallows it", (sessionReplay, siteType) => {
    expect(resolveNetworkReplayConfig({ enabled: true }, undefined, sessionReplay, siteType).enabled).toBe(false);
  });

  it("rejects unknown configuration properties", () => {
    expect(networkReplayConfigSchema.safeParse({ enabled: true, unknown: true }).success).toBe(false);
  });

  it("validates nested byte limits", () => {
    expect(
      getNetworkReplayConfigError({
        ...DEFAULT_NETWORK_REPLAY_CONFIG,
        maxBodySizeBytes: 2_000,
        maxNetworkEventSizeBytes: 1_000,
      })
    ).toMatch(/body limit/);
    expect(
      getNetworkReplayConfigError({
        ...DEFAULT_NETWORK_REPLAY_CONFIG,
        maxNetworkEventSizeBytes: 2_000,
        maxReplayBatchSizeBytes: 1_000,
      })
    ).toMatch(/event limit/);
  });
});
