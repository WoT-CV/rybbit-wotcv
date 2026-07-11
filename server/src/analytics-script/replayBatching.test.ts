import { describe, expect, it } from "vitest";

import type { SessionReplayEvent } from "./types.js";
import { getReplayBatchKey, getReplayEventsByteSize } from "./replayBatching.js";

const events: SessionReplayEvent[] = [
  { type: 1, data: { value: "a" }, timestamp: 10, sequenceNumber: 2 },
  { type: 2, data: { value: "bb" }, timestamp: 20, sequenceNumber: 3 },
];

describe("replayBatching", () => {
  it("calculates a stable positive byte size", () => {
    expect(getReplayEventsByteSize(events)).toBeGreaterThan(0);
    expect(getReplayEventsByteSize(events)).toBe(getReplayEventsByteSize([...events]));
  });

  it("builds a stable key from the first sequence number", () => {
    expect(getReplayBatchKey(events)).toBe("2");
    expect(getReplayBatchKey([])).toBe("empty");
  });
});
