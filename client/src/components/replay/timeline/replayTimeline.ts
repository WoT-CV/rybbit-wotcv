import type { ParsedNetworkRequest } from "../network/types";
import { NETWORK_PLUGIN_NAME } from "../network/parseNetworkEvents";
import type { MeaningfulEvent, TechnicalGroup } from "../replayEvents";

export interface TimelinePositionedRow {
  key: string;
  startOffset: number;
  endOffset: number;
}

export interface MeaningfulTimelineRow extends TimelinePositionedRow {
  kind: "meaningful";
  event: MeaningfulEvent;
}

export interface TechnicalTimelineRow extends TimelinePositionedRow {
  kind: "technical";
  group: TechnicalGroup;
}

export interface NetworkTimelineRow extends TimelinePositionedRow {
  kind: "network";
  request: ParsedNetworkRequest;
}

export type ReplayTimelineDataRow = MeaningfulTimelineRow | TechnicalTimelineRow | NetworkTimelineRow;

export interface CurrentTimeMarkerRow {
  kind: "current-time-marker";
  key: "current-time-marker";
  offset: number;
}

export type ReplayTimelineRow<T extends TimelinePositionedRow = ReplayTimelineDataRow> = T | CurrentTimeMarkerRow;

export interface TimelineRowsWithMarker<T extends TimelinePositionedRow> {
  rows: ReplayTimelineRow<T>[];
  markerIndex: number;
}

export function buildMeaningfulTimelineRows(events: readonly MeaningfulEvent[]): MeaningfulTimelineRow[] {
  return events.map(event => ({
    kind: "meaningful",
    key: `meaningful:${event.key}`,
    startOffset: event.offset,
    endOffset: event.offset,
    event,
  }));
}

export function buildTechnicalTimelineRows(groups: readonly TechnicalGroup[]): TechnicalTimelineRow[] {
  return groups.map(group => ({
    kind: "technical",
    key: `technical:${group.key}`,
    startOffset: group.offset,
    endOffset: group.endOffset,
    group,
  }));
}

export function buildNetworkTimelineRows(requests: readonly ParsedNetworkRequest[]): NetworkTimelineRow[] {
  return requests.map(request => ({
    kind: "network",
    key: getNetworkTimelineKey(request),
    startOffset: request.startOffset,
    endOffset: request.endOffset,
    request,
  }));
}

export function buildAllTimelineRows(
  groups: readonly TechnicalGroup[],
  requests: readonly ParsedNetworkRequest[],
  expandedNetworkEventIndexes: ReadonlySet<number>
): Array<TechnicalTimelineRow | NetworkTimelineRow> {
  const technicalRows = buildTechnicalTimelineRows(groups).filter(row => {
    if (row.group.pluginName !== NETWORK_PLUGIN_NAME || row.group.sourceEventIndexes.length === 0) return true;
    return !row.group.sourceEventIndexes.every(index => expandedNetworkEventIndexes.has(index));
  });

  return [...technicalRows, ...buildNetworkTimelineRows(requests)].sort(compareTimelineRows);
}

export function insertCurrentTimeMarker<T extends TimelinePositionedRow>(
  rows: readonly T[],
  currentTime: number
): TimelineRowsWithMarker<T> {
  const safeCurrentTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const markerIndex = findMarkerIndex(rows, safeCurrentTime);
  const rowsWithMarker: ReplayTimelineRow<T>[] = [...rows];
  rowsWithMarker.splice(markerIndex, 0, {
    kind: "current-time-marker",
    key: "current-time-marker",
    offset: safeCurrentTime,
  });

  return { rows: rowsWithMarker, markerIndex };
}

export function getNetworkTimelineKey(request: Pick<ParsedNetworkRequest, "requestId">): string {
  return `network:${request.requestId}`;
}

export function compareTimelineRows(first: TimelinePositionedRow, second: TimelinePositionedRow): number {
  return (
    first.startOffset - second.startOffset || first.endOffset - second.endOffset || first.key.localeCompare(second.key)
  );
}

function findMarkerIndex<T extends TimelinePositionedRow>(rows: readonly T[], currentTime: number): number {
  let low = 0;
  let high = rows.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle].startOffset <= currentTime) low = middle + 1;
    else high = middle;
  }

  return low;
}
