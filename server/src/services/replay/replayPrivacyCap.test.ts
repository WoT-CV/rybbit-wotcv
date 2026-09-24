import { describe, expect, it } from "vitest";
import { DEFAULT_NETWORK_REPLAY_CONFIG, resolveNetworkReplayPrivacyCap } from "@rybbit/shared";

describe("privacy rollout across old and new script tags", () => {
  for (const enabled of [false, true]) {
    for (const captureMode of ["full", "metadata"] as const) {
      for (const tag of [undefined, null, "full", " Full ", "metadata", "", "metdata"]) {
        it(`${enabled}/${captureMode}/${tag ?? "absent"}`, () => {
          const input = { ...DEFAULT_NETWORK_REPLAY_CONFIG, captureMode, enabled };
          const result = resolveNetworkReplayPrivacyCap(input, tag);
          const metadata = captureMode === "metadata" || (tag != null && tag.trim().toLowerCase() !== "full");
          expect(result.enabled).toBe(enabled);
          expect(result.captureMode).toBe(metadata ? "metadata" : "full");
          expect(result.captureResponseBody).toBe(!metadata);
          expect(result.captureRequestHeaders).toBe(!metadata);
          expect(result.maxReplayBatchSizeBytes).toBe(input.maxReplayBatchSizeBytes);
          expect(input.captureResponseBody).toBe(true);
        });
      }
    }
  }
});
