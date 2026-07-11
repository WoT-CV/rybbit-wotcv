import { MAX_REPLAY_EXPORT_DURATION_MS } from "@rybbit/shared";
import { describe, expect, it } from "vitest";

import { replayExportRangeSchema } from "./replayExportSchema.js";

describe("replayExportRangeSchema", () => {
  it("accepts only start and end offsets", () => {
    expect(replayExportRangeSchema.parse({ startMs: 10, endMs: 20 })).toEqual({ startMs: 10, endMs: 20 });
    expect(replayExportRangeSchema.safeParse({ startMs: 10, endMs: 20, playbackSpeed: 4 }).success).toBe(false);
  });

  it("rejects reversed and oversized ranges", () => {
    expect(replayExportRangeSchema.safeParse({ startMs: 20, endMs: 10 }).success).toBe(false);
    expect(
      replayExportRangeSchema.safeParse({ startMs: 0, endMs: MAX_REPLAY_EXPORT_DURATION_MS + 1 }).success
    ).toBe(false);
  });
});
