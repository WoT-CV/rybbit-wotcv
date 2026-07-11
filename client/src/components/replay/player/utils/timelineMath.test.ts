import { describe, expect, it } from "vitest";
import { constrainSlidingRange, getTimelineRangeStyle, toTimelinePercent } from "./timelineMath";

describe("timeline math", () => {
  it("clamps percentages to the visible timeline", () => {
    expect(toTimelinePercent(-10, 100)).toBe(0);
    expect(toTimelinePercent(25, 100)).toBe(25);
    expect(toTimelinePercent(150, 100)).toBe(100);
    expect(toTimelinePercent(10, 0)).toBe(0);
  });

  it("keeps the export window sliding when its end handle moves", () => {
    expect(constrainSlidingRange([15_000, 60_000], [15_000, 45_000], 120_000, 30_000)).toEqual([
      30_000,
      60_000,
    ]);
  });

  it("creates a bounded range style", () => {
    expect(getTimelineRangeStyle(20, 60, 100)).toEqual({ left: "20%", width: "40%" });
  });
});
