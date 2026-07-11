import type { CSSProperties } from "react";

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
  maximumRange: number
): [number, number] {
  const start = clamp(nextRange[0], 0, duration);
  const end = clamp(nextRange[1], start, duration);
  if (end - start <= maximumRange) return [start, end];

  const startMovedMore = Math.abs(start - currentRange[0]) > Math.abs(end - currentRange[1]);
  return startMovedMore ? [start, Math.min(duration, start + maximumRange)] : [Math.max(0, end - maximumRange), end];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
