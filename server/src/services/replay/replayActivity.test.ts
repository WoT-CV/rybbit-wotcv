import { calculateReplayActivityWindows, getReplayCaptureVersion } from "@rybbit/shared";
import { describe, expect, it } from "vitest";

describe("replay activity segmentation", () => {
  it("pads activity by 500 ms before and 1000 ms after", () => {
    const events = [
      { type: 5, data: {}, timestamp: 1_000 },
      { type: 3, data: { source: 1 }, timestamp: 3_000 },
    ];
    expect(calculateReplayActivityWindows(events, 5_000)).toEqual([{ start: 1_500, end: 3_000, eventCount: 1 }]);
  });

  it("merges overlapping activity windows", () => {
    const events = [
      { type: 5, data: {}, timestamp: 1_000 },
      { type: 3, data: { source: 2 }, timestamp: 2_000 },
      { type: 3, data: { source: 5 }, timestamp: 2_800 },
    ];
    expect(calculateReplayActivityWindows(events, 5_000)).toEqual([{ start: 500, end: 2_800, eventCount: 2 }]);
  });

  it("reads the WoT-CV activity capture version", () => {
    expect(
      getReplayCaptureVersion([
        {
          type: 5,
          timestamp: 1,
          data: { tag: "wotcv/replay-config", payload: { activityCaptureVersion: 2 } },
        },
      ])
    ).toBe(2);
  });
});
