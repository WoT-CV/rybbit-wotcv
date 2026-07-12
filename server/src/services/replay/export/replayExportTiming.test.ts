import { describe, expect, it } from "vitest";

import { validateReplayExportActivityDuration } from "./replayExportTiming.js";

describe("replay export timing", () => {
  it("allows a long source range when active playback fits within two minutes", () => {
    expect(
      validateReplayExportActivityDuration([
        { start: 0, end: 30_000 },
        { start: 15 * 60_000, end: 16 * 60_000 },
      ])
    ).toBe(90_000);
  });

  it("rejects exports with no activity or over two minutes of active playback", () => {
    expect(() => validateReplayExportActivityDuration([])).toThrow("contains no user activity");
    expect(() => validateReplayExportActivityDuration([{ start: 0, end: 120_001 }])).toThrow(
      "cannot exceed 2 minutes of active playback"
    );
  });
});
