import type { SessionReplayEvent } from "./types.js";
import { getJsonByteSize } from "./networkReplay/utils.js";

export function getReplayEventsByteSize(events: readonly SessionReplayEvent[]): number {
  return events.reduce((total, event) => total + getJsonByteSize(event), 0);
}

export function getReplayBatchKey(events: readonly SessionReplayEvent[]): string {
  const first = events[0];
  return String(first?.sequenceNumber ?? first?.timestamp ?? "empty");
}
