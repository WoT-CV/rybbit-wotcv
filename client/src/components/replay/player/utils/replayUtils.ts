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

export interface ReplaySegment extends ActivityPeriod {
  duration: number;
  eventCount: number;
  isActive: boolean;
  kind: "active" | "inactive";
}

export type ReplayCaptureProfile = "posthog-compatible" | "legacy";

export interface ReplayTimeline {
  activityPeriods: ActivityPeriod[];
  activeMs: number;
  captureProfile: ReplayCaptureProfile;
  captureVersion: number | null;
  inactiveMs: number;
  segments: ReplaySegment[];
}

export interface InactivitySkipTarget extends ActivityPeriod {
  from: number;
  to: number;
  skippedMs: number;
}

export const ACTIVITY_THRESHOLD_MS = 5000;
export const MIN_INACTIVITY_SKIP_MS = ACTIVITY_THRESHOLD_MS;

const FULL_SNAPSHOT_EVENT_TYPE = 2;
const INCREMENTAL_EVENT_TYPE = 3;
const META_EVENT_TYPE = 4;
const CUSTOM_EVENT_TYPE = 5;
const POSTHOG_ACTIVE_SOURCES = new Set([1, 2, 3, 4, 5, 6, 7, 12]);

export const calculateReplayTimeline = (events: any[], totalDuration: number): ReplayTimeline => {
  const safeDuration = Math.max(0, Number.isFinite(totalDuration) ? totalDuration : 0);
  const sortedEvents = [...(events ?? [])]
    .filter(event => Number.isFinite(event?.timestamp))
    .sort((first, second) => first.timestamp - second.timestamp);
  const captureVersion = getCaptureVersion(sortedEvents);
  const captureProfile: ReplayCaptureProfile =
    captureVersion !== null && captureVersion >= 2 ? "posthog-compatible" : "legacy";

  if (sortedEvents.length === 0 || safeDuration <= 0) {
    return {
      activityPeriods: [],
      activeMs: 0,
      captureProfile,
      captureVersion,
      inactiveMs: safeDuration,
      segments: safeDuration > 0 ? [createSegment("inactive", 0, safeDuration, 0)] : [],
    };
  }

  const firstEventTime = sortedEvents[0].timestamp;
  const rawSegments: ReplaySegment[] = [];
  let currentSegment: ReplaySegment | null = null;
  let lastActiveEventOffset: number | null = null;

  for (const event of sortedEvents) {
    const offset = clampOffset(event.timestamp - firstEventTime, safeDuration);
    const eventIsActive = isActiveReplayEvent(event);
    const startsNewSegment =
      currentSegment === null ||
      (eventIsActive && !currentSegment.isActive) ||
      (currentSegment.isActive &&
        lastActiveEventOffset !== null &&
        lastActiveEventOffset + ACTIVITY_THRESHOLD_MS < offset);

    if (startsNewSegment) {
      if (currentSegment) {
        rawSegments.push(finalizeSegment(currentSegment));
      }
      currentSegment = createSegment(eventIsActive ? "active" : "inactive", offset, offset, 1);
    } else if (currentSegment) {
      currentSegment.end = offset;
      currentSegment.eventCount += 1;
    }

    if (eventIsActive) {
      lastActiveEventOffset = offset;
    }
  }

  if (currentSegment) {
    rawSegments.push(finalizeSegment(currentSegment));
  }

  const segments = fillAndMergeSegments(rawSegments, safeDuration);
  const activityPeriods = segments
    .filter(segment => segment.isActive)
    .map(segment => ({ start: segment.start, end: segment.end }));
  const activeMs = segments.filter(segment => segment.isActive).reduce((total, segment) => total + segment.duration, 0);

  return {
    activityPeriods,
    activeMs,
    captureProfile,
    captureVersion,
    inactiveMs: Math.max(0, safeDuration - activeMs),
    segments,
  };
};

export const calculateActivityPeriods = (events: any[], totalDuration: number): ActivityPeriod[] =>
  calculateReplayTimeline(events, totalDuration).activityPeriods;

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
  minInactiveDurationMs = MIN_INACTIVITY_SKIP_MS,
  totalDuration?: number
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

  if (Number.isFinite(totalDuration) && totalDuration !== undefined && safeCurrentTime < totalDuration) {
    const safeTotalDuration = Math.max(0, totalDuration);
    const skippedMs = safeTotalDuration - safeCurrentTime;

    if (skippedMs >= minInactiveDurationMs) {
      return {
        start: safeTotalDuration,
        end: safeTotalDuration,
        from: safeCurrentTime,
        to: safeTotalDuration,
        skippedMs,
      };
    }
  }

  return null;
}

export function findSegmentAtTime(segments: ReplaySegment[], currentTime: number): ReplaySegment | null {
  const safeCurrentTime = Math.max(0, currentTime);
  return (
    segments.find(
      (segment, index) =>
        safeCurrentTime >= segment.start &&
        (safeCurrentTime < segment.end || (index === segments.length - 1 && safeCurrentTime <= segment.end))
    ) ?? null
  );
}

export function findPreviousActiveSegment(segments: ReplaySegment[], beforeTime: number): ReplaySegment | null {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment.isActive && segment.start < beforeTime) {
      return segment;
    }
  }
  return null;
}

export function getReplayActivityOffsets(events: any[], totalDuration: number): number[] {
  const sortedEvents = [...(events ?? [])]
    .filter(event => Number.isFinite(event?.timestamp))
    .sort((first, second) => first.timestamp - second.timestamp);
  const firstEventTime = sortedEvents[0]?.timestamp;

  if (firstEventTime === undefined) return [];

  return sortedEvents
    .filter(isActiveReplayEvent)
    .map(event => clampOffset(event.timestamp - firstEventTime, totalDuration));
}

function getCaptureVersion(events: any[]): number | null {
  const configEvent = events.find(
    event =>
      Number(event?.type) === CUSTOM_EVENT_TYPE &&
      event?.data?.tag === "wotcv/replay-config" &&
      Number.isFinite(Number(event?.data?.payload?.activityCaptureVersion))
  );

  return configEvent ? Number(configEvent.data.payload.activityCaptureVersion) : null;
}

function isActiveReplayEvent(event: any): boolean {
  const eventType = Number(event?.type);
  return (
    eventType === FULL_SNAPSHOT_EVENT_TYPE ||
    eventType === META_EVENT_TYPE ||
    (eventType === INCREMENTAL_EVENT_TYPE && POSTHOG_ACTIVE_SOURCES.has(Number(event?.data?.source)))
  );
}

function fillAndMergeSegments(rawSegments: ReplaySegment[], totalDuration: number): ReplaySegment[] {
  const filled: ReplaySegment[] = [];

  for (const segment of rawSegments) {
    const previous = filled[filled.length - 1];
    if (!previous && segment.start > 0) {
      filled.push(createSegment("inactive", 0, segment.start, 0));
    } else if (previous && segment.start > previous.end) {
      filled.push(createSegment("inactive", previous.end, segment.start, 0));
    }
    filled.push(finalizeSegment(segment));
  }

  const latest = filled[filled.length - 1];
  if (!latest && totalDuration > 0) {
    filled.push(createSegment("inactive", 0, totalDuration, 0));
  } else if (latest && latest.end < totalDuration) {
    filled.push(createSegment("inactive", latest.end, totalDuration, 0));
  }

  return filled.reduce<ReplaySegment[]>((merged, segment) => {
    const current = merged[merged.length - 1];
    if (current && current.isActive === segment.isActive && segment.start <= current.end) {
      current.end = Math.max(current.end, segment.end);
      current.duration = current.end - current.start;
      current.eventCount += segment.eventCount;
      return merged;
    }
    merged.push({ ...segment });
    return merged;
  }, []);
}

function createSegment(kind: ReplaySegment["kind"], start: number, end: number, eventCount: number): ReplaySegment {
  return {
    start,
    end,
    duration: Math.max(0, end - start),
    eventCount,
    isActive: kind === "active",
    kind,
  };
}

function finalizeSegment(segment: ReplaySegment): ReplaySegment {
  return { ...segment, duration: Math.max(0, segment.end - segment.start) };
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

export const CONTROLS_HEIGHT = 144;
export const SKIP_SECONDS = 10000;
export const OVERLAY_TIMEOUT = 800;
