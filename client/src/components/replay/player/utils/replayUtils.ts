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
const USER_ACTIVITY_INCREMENTAL_SOURCES = new Set([1, 2, 3, 5, 6, 7, 12, 14]);

export const calculateActivityPeriods = (events: any[], totalDuration: number): ActivityPeriod[] => {
  if (!events || events.length === 0 || totalDuration <= 0) return [];

  const firstEventTime = events[0].timestamp;
  const periods: ActivityPeriod[] = [
    {
      start: 0,
      end: Math.min(totalDuration, INACTIVITY_SKIP_THRESHOLD_MS),
    },
  ];

  events
    .filter(isUserActivityEvent)
    .map(event => Math.max(0, Math.min(totalDuration, event.timestamp - firstEventTime)))
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

function isUserActivityEvent(event: any): boolean {
  const eventType = Number(event.type);

  if (eventType === 4 && event.data?.href) {
    return true;
  }

  if (eventType !== 3) {
    return false;
  }

  return USER_ACTIVITY_INCREMENTAL_SOURCES.has(Number(event.data?.source));
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
