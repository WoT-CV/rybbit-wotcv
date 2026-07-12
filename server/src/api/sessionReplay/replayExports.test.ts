import { describe, expect, it } from "vitest";

import { replayExportRangeSchema } from "./replayExportSchema.js";

describe("replayExportRangeSchema", () => {
  it("accepts only start and end offsets", () => {
    expect(replayExportRangeSchema.parse({ startMs: 10, endMs: 20 })).toEqual({ startMs: 10, endMs: 20 });
    expect(replayExportRangeSchema.safeParse({ startMs: 10, endMs: 20, playbackSpeed: 4 }).success).toBe(false);
  });

  it("rejects reversed ranges but accepts long source ranges", () => {
    expect(replayExportRangeSchema.safeParse({ startMs: 20, endMs: 10 }).success).toBe(false);
    expect(replayExportRangeSchema.safeParse({ startMs: 0, endMs: 30 * 60_000 }).success).toBe(true);
  });
});
