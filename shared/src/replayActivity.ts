export const REPLAY_ACTIVITY_PRE_ROLL_MS = 500;
export const REPLAY_ACTIVITY_POST_ROLL_MS = 1_000;

const FULL_SNAPSHOT_EVENT_TYPE = 2;
const INCREMENTAL_EVENT_TYPE = 3;
const META_EVENT_TYPE = 4;
const CUSTOM_EVENT_TYPE = 5;
const ACTIVE_INCREMENTAL_SOURCES = new Set([1, 2, 3, 4, 5, 6, 7, 12]);

export interface ReplayActivityEvent {
  timestamp: number;
  type: string | number;
  data?: unknown;
}

export interface ReplayActivityWindow {
  start: number;
  end: number;
  eventCount: number;
}

export function calculateReplayActivityWindows(
  events: readonly ReplayActivityEvent[],
  totalDuration: number,
  rangeStart = 0,
  rangeEnd = totalDuration
): ReplayActivityWindow[] {
  const sortedEvents = getSortedReplayEvents(events);
  const firstTimestamp = sortedEvents[0]?.timestamp;
  if (firstTimestamp === undefined) return [];

  const safeStart = clamp(rangeStart, 0, totalDuration);
  const safeEnd = clamp(rangeEnd, safeStart, totalDuration);
  const windows = sortedEvents
    .filter(isReplayActivityEvent)
    .map(event => event.timestamp - firstTimestamp)
    .filter(offset => offset >= safeStart - REPLAY_ACTIVITY_POST_ROLL_MS && offset <= safeEnd + REPLAY_ACTIVITY_PRE_ROLL_MS)
    .map(offset => ({
      start: Math.max(safeStart, offset - REPLAY_ACTIVITY_PRE_ROLL_MS),
      end: Math.min(safeEnd, offset + REPLAY_ACTIVITY_POST_ROLL_MS),
      eventCount: 1,
    }));

  return windows.reduce<ReplayActivityWindow[]>((merged, window) => {
    const current = merged.at(-1);
    if (!current || window.start > current.end) {
      merged.push({ ...window });
    } else {
      current.end = Math.max(current.end, window.end);
      current.eventCount += 1;
    }
    return merged;
  }, []);
}

export function getReplayActivityOffsets(events: readonly ReplayActivityEvent[], totalDuration: number): number[] {
  const sortedEvents = getSortedReplayEvents(events);
  const firstTimestamp = sortedEvents[0]?.timestamp;
  if (firstTimestamp === undefined) return [];

  return sortedEvents
    .filter(isReplayActivityEvent)
    .map(event => clamp(event.timestamp - firstTimestamp, 0, totalDuration));
}

export function getReplayCaptureVersion(events: readonly ReplayActivityEvent[]): number | null {
  for (const event of events) {
    if (Number(event.type) !== CUSTOM_EVENT_TYPE || !isRecord(event.data) || event.data.tag !== "wotcv/replay-config") {
      continue;
    }
    const payload = event.data.payload;
    if (!isRecord(payload)) continue;
    const version = Number(payload.activityCaptureVersion);
    if (Number.isFinite(version)) return version;
  }
  return null;
}

export function isReplayActivityEvent(event: ReplayActivityEvent): boolean {
  const eventType = Number(event.type);
  if (eventType === FULL_SNAPSHOT_EVENT_TYPE || eventType === META_EVENT_TYPE) return true;
  if (eventType !== INCREMENTAL_EVENT_TYPE || !isRecord(event.data)) return false;
  return ACTIVE_INCREMENTAL_SOURCES.has(Number(event.data.source));
}

function getSortedReplayEvents(events: readonly ReplayActivityEvent[]): ReplayActivityEvent[] {
  return events
    .filter(event => Number.isFinite(event.timestamp))
    .slice()
    .sort((first, second) => first.timestamp - second.timestamp);
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
