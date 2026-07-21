import type { TimelinePositionedRow } from "./replayTimeline";

export const TIMELINE_HIGHLIGHT_DURATION_MS = 1_500;
export const MAX_RECENT_TIMELINE_HIGHLIGHTS = 24;

export function getActiveTimelineKeys(rows: readonly TimelinePositionedRow[], currentTime: number): string[] {
  return rows.filter(row => row.startOffset <= currentTime && row.endOffset >= currentTime).map(row => row.key);
}

export function getCrossedTimelineKeys(
  rows: readonly TimelinePositionedRow[],
  previousTime: number,
  currentTime: number,
  limit = MAX_RECENT_TIMELINE_HIGHLIGHTS
): string[] {
  if (currentTime <= previousTime || limit <= 0) return [];

  const crossed: string[] = [];
  for (const row of rows) {
    if (row.startOffset <= previousTime) continue;
    if (row.startOffset > currentTime) break;
    crossed.push(row.key);
  }

  return crossed.slice(-limit);
}

export function getSeekTimelineKeys(rows: readonly TimelinePositionedRow[], currentTime: number): string[] {
  const activeKeys = getActiveTimelineKeys(rows, currentTime);
  if (activeKeys.length > 0) return activeKeys.slice(-MAX_RECENT_TIMELINE_HIGHLIGHTS);

  let latestOffset = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (row.startOffset > currentTime) break;
    latestOffset = row.startOffset;
  }
  if (!Number.isFinite(latestOffset)) return [];

  return rows
    .filter(row => row.startOffset === latestOffset)
    .slice(-MAX_RECENT_TIMELINE_HIGHLIGHTS)
    .map(row => row.key);
}

export function updateHighlightExpirations(
  current: ReadonlyMap<string, number>,
  keys: readonly string[],
  now: number,
  durationMs = TIMELINE_HIGHLIGHT_DURATION_MS
): Map<string, number> {
  const next = pruneHighlightExpirations(current, now);
  const expiresAt = now + durationMs;
  for (const key of keys) next.set(key, expiresAt);

  if (next.size <= MAX_RECENT_TIMELINE_HIGHLIGHTS) return next;

  return new Map(
    [...next.entries()]
      .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
      .slice(0, MAX_RECENT_TIMELINE_HIGHLIGHTS)
  );
}

export function pruneHighlightExpirations(current: ReadonlyMap<string, number>, now: number): Map<string, number> {
  return new Map([...current].filter(([, expiresAt]) => expiresAt > now));
}
