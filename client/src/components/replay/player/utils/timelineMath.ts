import type { CSSProperties } from "react";

import { getReplayActivityDuration, type ReplayActivityPeriod } from "@rybbit/shared";

export function toTimelinePercent(offset: number, duration: number): number {
  if (!Number.isFinite(offset) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(100, (offset / duration) * 100));
}

export function getTimelineRangeStyle(start: number, end: number, duration: number): CSSProperties {
  const startPercent = toTimelinePercent(start, duration);
  const endPercent = toTimelinePercent(end, duration);
  return { left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` };
}

export function constrainSlidingRange(
  nextRange: [number, number],
  currentRange: [number, number],
  duration: number,
  maximumRange: number,
  activityPeriods: readonly ReplayActivityPeriod[] = []
): [number, number] {
  const start = clamp(nextRange[0], 0, duration);
  const end = clamp(nextRange[1], start, duration);
  if (activityPeriods.length === 0) {
    if (end - start <= maximumRange) return [start, end];

    const startMovedMore = Math.abs(start - currentRange[0]) > Math.abs(end - currentRange[1]);
    return startMovedMore ? [start, Math.min(duration, start + maximumRange)] : [Math.max(0, end - maximumRange), end];
  }

  if (getReplayActivityDuration(activityPeriods, start, end) <= maximumRange) return [start, end];

  const startMovedMore = Math.abs(start - currentRange[0]) > Math.abs(end - currentRange[1]);
  return startMovedMore
    ? [start, findEndForActiveDuration(start, duration, maximumRange, activityPeriods)]
    : [findStartForActiveDuration(end, maximumRange, activityPeriods), end];
}

export function createInitialActiveRange(
  currentTime: number,
  duration: number,
  maximumActiveDuration: number,
  activityPeriods: readonly ReplayActivityPeriod[]
): [number, number] {
  const safeDuration = Math.max(0, duration);
  if (safeDuration === 0) return [0, 0];

  if (activityPeriods.length === 0) {
    const rangeDuration = Math.min(maximumActiveDuration, safeDuration);
    const start = clamp(currentTime - rangeDuration / 2, 0, Math.max(0, safeDuration - rangeDuration));
    return [start, start + rangeDuration];
  }

  if (getReplayActivityDuration(activityPeriods, 0, safeDuration) <= maximumActiveDuration) {
    return [0, safeDuration];
  }

  const midpoint = clamp(currentTime, 0, safeDuration);
  let start = findStartForActiveDuration(midpoint, maximumActiveDuration / 2, activityPeriods);
  const end = findEndForActiveDuration(start, safeDuration, maximumActiveDuration, activityPeriods);

  if (getReplayActivityDuration(activityPeriods, start, end) < maximumActiveDuration) {
    start = findStartForActiveDuration(end, maximumActiveDuration, activityPeriods);
  }

  return [start, end];
}

function findEndForActiveDuration(
  start: number,
  duration: number,
  maximumActiveDuration: number,
  activityPeriods: readonly ReplayActivityPeriod[]
): number {
  let remaining = maximumActiveDuration;

  for (const period of activityPeriods) {
    const periodStart = Math.max(start, period.start);
    const periodEnd = Math.min(duration, period.end);
    if (periodEnd <= periodStart) continue;

    const activeDuration = periodEnd - periodStart;
    if (activeDuration >= remaining) return periodStart + remaining;
    remaining -= activeDuration;
  }

  return duration;
}

function findStartForActiveDuration(
  end: number,
  maximumActiveDuration: number,
  activityPeriods: readonly ReplayActivityPeriod[]
): number {
  let remaining = maximumActiveDuration;

  for (let index = activityPeriods.length - 1; index >= 0; index -= 1) {
    const period = activityPeriods[index];
    const periodStart = Math.max(0, period.start);
    const periodEnd = Math.min(end, period.end);
    if (periodEnd <= periodStart) continue;

    const activeDuration = periodEnd - periodStart;
    if (activeDuration >= remaining) return periodEnd - remaining;
    remaining -= activeDuration;
  }

  return 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
