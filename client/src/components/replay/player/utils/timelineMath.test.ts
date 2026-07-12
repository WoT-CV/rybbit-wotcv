import { describe, expect, it } from "vitest";
import {
  constrainSlidingRange,
  createInitialActiveRange,
  getTimelineRangeStyle,
  toTimelinePercent,
} from "./timelineMath";

describe("timeline math", () => {
  it("clamps percentages to the visible timeline", () => {
    expect(toTimelinePercent(-10, 100)).toBe(0);
    expect(toTimelinePercent(25, 100)).toBe(25);
    expect(toTimelinePercent(150, 100)).toBe(100);
    expect(toTimelinePercent(10, 0)).toBe(0);
  });

  it("keeps the export window sliding when its end handle moves", () => {
    expect(constrainSlidingRange([15_000, 60_000], [15_000, 45_000], 120_000, 30_000)).toEqual([30_000, 60_000]);
  });

  it("allows a long source range when active playback stays within the limit", () => {
    const activityPeriods = [
      { start: 0, end: 15_000 },
      { start: 16 * 60_000, end: 17 * 60_000 },
    ];

    expect(constrainSlidingRange([0, 17 * 60_000], [0, 120_000], 17 * 60_000, 120_000, activityPeriods)).toEqual([
      0,
      17 * 60_000,
    ]);
  });

  it("slides the opposite handle when active playback exceeds the limit", () => {
    const activityPeriods = [
      { start: 0, end: 60_000 },
      { start: 5 * 60_000, end: 6 * 60_000 },
      { start: 10 * 60_000, end: 11 * 60_000 },
    ];

    expect(constrainSlidingRange([0, 11 * 60_000], [0, 6 * 60_000], 11 * 60_000, 120_000, activityPeriods)).toEqual([
      5 * 60_000,
      11 * 60_000,
    ]);
  });

  it("selects the whole replay when its active playback fits the export limit", () => {
    expect(
      createInitialActiveRange(0, 17 * 60_000, 120_000, [
        { start: 0, end: 15_000 },
        { start: 16 * 60_000, end: 17 * 60_000 },
      ])
    ).toEqual([0, 17 * 60_000]);
  });

  it("creates a bounded range style", () => {
    expect(getTimelineRangeStyle(20, 60, 100)).toEqual({ left: "20%", width: "40%" });
  });
});
