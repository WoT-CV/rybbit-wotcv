export const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export interface ActivityPeriod {
  start: number;
  end: number;
}

export interface InactivitySkipTarget extends ActivityPeriod {
  from: number;
  to: number;
  skippedMs: number;
}

export const INACTIVITY_SKIP_THRESHOLD_MS = 5000;
const MOUSE_MOVE_SOURCE = 1;
const MOUSE_INTERACTION_SOURCE = 2;
const INPUT_SOURCE = 5;
const TOUCH_MOVE_SOURCE = 6;
const DRAG_SOURCE = 12;
const USER_POINTER_MOVEMENT_SOURCES = new Set([MOUSE_MOVE_SOURCE, TOUCH_MOVE_SOURCE, DRAG_SOURCE]);
const USER_POINTER_INTERACTION_TYPES = new Set([0, 1, 2, 3, 4, 7, 8, 9, 10]);

export const calculateActivityPeriods = (events: any[], totalDuration: number): ActivityPeriod[] => {
  if (!events || events.length === 0 || totalDuration <= 0) return [];

  const firstEventTime = events.find(event => Number.isFinite(event.timestamp))?.timestamp;
  if (firstEventTime === undefined) return [];

  const periods: ActivityPeriod[] = [
    {
      start: 0,
      end: Math.min(totalDuration, INACTIVITY_SKIP_THRESHOLD_MS),
    },
  ];

  events
    .flatMap(event => getUserActivityOffsets(event, firstEventTime, totalDuration))
    .sort((first, second) => first - second)
    .forEach(offset => {
      periods.push({
        start: offset,
        end: Math.min(totalDuration, offset + INACTIVITY_SKIP_THRESHOLD_MS),
      });
    });

  return normalizeActivityPeriods(periods);
};

export function normalizeActivityPeriods(periods: ActivityPeriod[]): ActivityPeriod[] {
  return periods
    .filter(period => Number.isFinite(period.start) && Number.isFinite(period.end) && period.end >= period.start)
    .sort((first, second) => first.start - second.start)
    .reduce<ActivityPeriod[]>((merged, period) => {
      const current = merged[merged.length - 1];

      if (!current || period.start > current.end) {
        merged.push({ ...period });
        return merged;
      }

      current.end = Math.max(current.end, period.end);
      return merged;
    }, []);
}

export function findNextActivityPeriod(
  currentTime: number,
  periods: ActivityPeriod[],
  minInactiveDurationMs = INACTIVITY_SKIP_THRESHOLD_MS
): InactivitySkipTarget | null {
  const normalizedPeriods = normalizeActivityPeriods(periods);
  const safeCurrentTime = Math.max(0, currentTime);

  for (const period of normalizedPeriods) {
    if (safeCurrentTime >= period.start && safeCurrentTime <= period.end) {
      return null;
    }

    if (safeCurrentTime < period.start) {
      const skippedMs = period.start - safeCurrentTime;

      if (skippedMs < minInactiveDurationMs) {
        return null;
      }

      return {
        ...period,
        from: safeCurrentTime,
        to: period.start,
        skippedMs,
      };
    }
  }

  return null;
}

function getUserActivityOffsets(event: any, firstEventTime: number, totalDuration: number): number[] {
  const eventType = Number(event.type);

  if (eventType !== 3) {
    return [];
  }

  const source = Number(event.data?.source);

  if (USER_POINTER_MOVEMENT_SOURCES.has(source)) {
    return getPointerMovementOffsets(event, firstEventTime, totalDuration);
  }

  if (source === MOUSE_INTERACTION_SOURCE) {
    return USER_POINTER_INTERACTION_TYPES.has(Number(event.data?.type))
      ? [getEventOffset(event.timestamp, firstEventTime, totalDuration)]
      : [];
  }

  if (source === INPUT_SOURCE) {
    return [getEventOffset(event.timestamp, firstEventTime, totalDuration)];
  }

  return [];
}

function getPointerMovementOffsets(event: any, firstEventTime: number, totalDuration: number): number[] {
  const baseOffset = getEventOffset(event.timestamp, firstEventTime, totalDuration);
  const positions = Array.isArray(event.data?.positions) ? event.data.positions : [];

  if (positions.length === 0) {
    return [baseOffset];
  }

  return positions.map((position: any) => {
    const timeOffset = Number.isFinite(position?.timeOffset) ? Number(position.timeOffset) : 0;
    return clampOffset(baseOffset + timeOffset, totalDuration);
  });
}

function getEventOffset(timestamp: number, firstEventTime: number, totalDuration: number): number {
  return clampOffset(timestamp - firstEventTime, totalDuration);
}

function clampOffset(offset: number, totalDuration: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(0, Math.min(totalDuration, offset));
}

export const PLAYBACK_SPEEDS = [
  { value: "0.25", label: "0.25x" },
  { value: "0.5", label: "0.5x" },
  { value: "1", label: "1x" },
  { value: "2", label: "2x" },
  { value: "4", label: "4x" },
];

export const CONTROLS_HEIGHT = 101;
export const SKIP_SECONDS = 10000; // 10 seconds in milliseconds
export const OVERLAY_TIMEOUT = 800; // milliseconds
