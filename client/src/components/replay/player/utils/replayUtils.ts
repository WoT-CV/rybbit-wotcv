import {
  calculateReplayActivityWindows,
  getReplayActivityOffsets as getSharedReplayActivityOffsets,
  getReplayCaptureVersion,
  type ReplayActivityEvent,
} from "@rybbit/shared";

export const formatTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
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

export const calculateReplayTimeline = (
  events: readonly ReplayActivityEvent[],
  totalDuration: number
): ReplayTimeline => {
  const safeDuration = Math.max(0, Number.isFinite(totalDuration) ? totalDuration : 0);
  const captureVersion = getReplayCaptureVersion(events);
  const captureProfile: ReplayCaptureProfile =
    captureVersion !== null && captureVersion >= 2 ? "posthog-compatible" : "legacy";
  const activityWindows = calculateReplayActivityWindows(events, safeDuration);
  const segments = createReplaySegments(activityWindows, safeDuration);
  const activeMs = activityWindows.reduce((total, window) => total + Math.max(0, window.end - window.start), 0);

  return {
    activityPeriods: activityWindows.map(({ start, end }) => ({ start, end })),
    activeMs,
    captureProfile,
    captureVersion,
    inactiveMs: Math.max(0, safeDuration - activeMs),
    segments,
  };
};

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
    if (segment.isActive && segment.start < beforeTime) return segment;
  }
  return null;
}

export function getReplayActivityOffsets(events: readonly ReplayActivityEvent[], totalDuration: number): number[] {
  return getSharedReplayActivityOffsets(events, totalDuration);
}

function createReplaySegments(
  activityWindows: Array<{ start: number; end: number; eventCount: number }>,
  totalDuration: number
): ReplaySegment[] {
  const segments: ReplaySegment[] = [];
  let cursor = 0;

  for (const window of activityWindows) {
    if (window.start > cursor) segments.push(createSegment("inactive", cursor, window.start, 0));
    segments.push(createSegment("active", window.start, window.end, window.eventCount));
    cursor = window.end;
  }

  if (cursor < totalDuration) segments.push(createSegment("inactive", cursor, totalDuration, 0));
  return segments;
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

export const PLAYBACK_SPEEDS = [
  { value: "0.25", label: "0.25x" },
  { value: "0.5", label: "0.5x" },
  { value: "1", label: "1x" },
  { value: "2", label: "2x" },
  { value: "4", label: "4x" },
];

export const SKIP_SECONDS = 10_000;
export const OVERLAY_TIMEOUT = 800;
