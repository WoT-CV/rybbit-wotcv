import { describe, expect, it } from "vitest";

import type { TimelinePositionedRow } from "./replayTimeline";
import {
  getActiveTimelineKeys,
  getCrossedTimelineKeys,
  getSeekTimelineKeys,
  pruneHighlightExpirations,
  TIMELINE_HIGHLIGHT_DURATION_MS,
  updateHighlightExpirations,
} from "./timelineHighlights";

const row = (key: string, startOffset: number, endOffset = startOffset): TimelinePositionedRow => ({
  key,
  startOffset,
  endOffset,
});

describe("timeline highlights", () => {
  it("finds interval rows active at the current replay time", () => {
    const rows = [row("request", 100, 200), row("later", 300, 400)];

    expect(getActiveTimelineKeys(rows, 150)).toEqual(["request"]);
    expect(getActiveTimelineKeys(rows, 250)).toEqual([]);
  });

  it("collects every row crossed between player updates", () => {
    const rows = [row("first", 100), row("second", 120), row("third", 180), row("later", 250)];

    expect(getCrossedTimelineKeys(rows, 90, 200)).toEqual(["first", "second", "third"]);
    expect(getCrossedTimelineKeys(rows, 200, 100)).toEqual([]);
  });

  it("selects all rows at the nearest reached offset after a seek", () => {
    const rows = [row("first", 100), row("same-a", 200), row("same-b", 200), row("later", 300)];

    expect(getSeekTimelineKeys(rows, 250)).toEqual(["same-a", "same-b"]);
    expect(getSeekTimelineKeys(rows, 50)).toEqual([]);
  });

  it("keeps highlights for 1.5 seconds of wall-clock time regardless of replay speed", () => {
    const startedAt = 10_000;
    const highlights = updateHighlightExpirations(new Map(), ["fast-request"], startedAt);

    expect(highlights.get("fast-request")).toBe(startedAt + TIMELINE_HIGHLIGHT_DURATION_MS);
    expect(pruneHighlightExpirations(highlights, startedAt + 1_499).has("fast-request")).toBe(true);
    expect(pruneHighlightExpirations(highlights, startedAt + 1_500).has("fast-request")).toBe(false);
  });

  it("refreshes an existing highlight instead of duplicating it", () => {
    const first = updateHighlightExpirations(new Map(), ["request"], 1_000);
    const refreshed = updateHighlightExpirations(first, ["request"], 2_000);

    expect(refreshed.size).toBe(1);
    expect(refreshed.get("request")).toBe(2_000 + TIMELINE_HIGHLIGHT_DURATION_MS);
  });
});
