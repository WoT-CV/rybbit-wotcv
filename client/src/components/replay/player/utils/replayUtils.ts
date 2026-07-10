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

export const calculateActivityPeriods = (events: any[], totalDuration: number): ActivityPeriod[] => {
  if (!events || events.length === 0) return [];

  // Filter for user interaction events (mouse moves, clicks, etc.)
  const interactionEvents = events.filter(event => {
    const eventType = parseInt(event.type.toString());
    // Type 3 = IncrementalSnapshot (includes mouse moves, clicks, etc.)
    return eventType === 3;
  });

  const periods: ActivityPeriod[] = [];
  const firstEventTime = events[0].timestamp;

  for (let i = 0; i < interactionEvents.length; i++) {
    const currentEvent = interactionEvents[i];
    const nextEvent = interactionEvents[i + 1];

    const currentTime = currentEvent.timestamp - firstEventTime;
    const nextTime = nextEvent ? nextEvent.timestamp - firstEventTime : totalDuration;

    if (nextTime - currentTime <= INACTIVITY_SKIP_THRESHOLD_MS) {
      periods.push({
        start: currentTime,
        end: nextTime,
      });
    }
  }

  return periods;
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
