import { describe, expect, it } from "vitest";

import type { ParsedNetworkRequest } from "../network/types";
import type { TechnicalGroup } from "../replayEvents";
import {
  buildAllTimelineRows,
  buildNetworkTimelineRows,
  insertCurrentTimeMarker,
  type TimelinePositionedRow,
} from "./replayTimeline";

const positionedRow = (key: string, startOffset: number, endOffset = startOffset): TimelinePositionedRow => ({
  key,
  startOffset,
  endOffset,
});

const technicalGroup = (overrides: Partial<TechnicalGroup> = {}): TechnicalGroup => ({
  count: 1,
  endOffset: 0,
  key: "technical-1",
  label: "Meta",
  offset: 0,
  sourceEventIndexes: [0],
  timestamp: 1_000,
  type: 4,
  ...overrides,
});

const networkRequest = (overrides: Partial<ParsedNetworkRequest> = {}): ParsedNetworkRequest => ({
  completedAt: 1_200,
  currentUrl: "https://wot-cv.com/players-to-check",
  durationMs: 100,
  endOffset: 200,
  host: "api.wot-cv.com",
  initiatorType: "fetch",
  method: "GET",
  outcome: "success",
  performanceEntryFound: false,
  requestHeaders: {},
  requestId: "request-1",
  responseHeaders: {},
  schemaVersion: 1,
  searchText: "get api.wot-cv.com /players",
  startOffset: 100,
  startedAt: 1_100,
  status: 200,
  url: "https://api.wot-cv.com/players",
  ...overrides,
});

describe("replay timeline", () => {
  it("places the current-time marker before, between and after rows", () => {
    const rows = [positionedRow("first", 100), positionedRow("second", 200)];

    expect(insertCurrentTimeMarker(rows, 0).markerIndex).toBe(0);
    expect(insertCurrentTimeMarker(rows, 150).markerIndex).toBe(1);
    expect(insertCurrentTimeMarker(rows, 200).markerIndex).toBe(2);
    expect(insertCurrentTimeMarker(rows, 300).markerIndex).toBe(2);
  });

  it("keeps a marker as the only row for an empty timeline", () => {
    expect(insertCurrentTimeMarker([], 250)).toEqual({
      markerIndex: 0,
      rows: [{ kind: "current-time-marker", key: "current-time-marker", offset: 250 }],
    });
  });

  it("merges network requests chronologically into the all view", () => {
    const rows = buildAllTimelineRows(
      [technicalGroup({ key: "later", offset: 300, endOffset: 300 })],
      [networkRequest({ startOffset: 100, endOffset: 200 })],
      new Set()
    );

    expect(rows.map(row => row.kind)).toEqual(["network", "technical"]);
    expect(rows.map(row => row.startOffset)).toEqual([100, 300]);
  });

  it("replaces only successfully expanded network plugin carriers", () => {
    const groups = [
      technicalGroup({
        key: "expanded-network",
        label: "Plugin: rrweb/network@1",
        pluginName: "rrweb/network@1",
        sourceEventIndexes: [1],
        type: 6,
      }),
      technicalGroup({
        key: "invalid-network",
        label: "Plugin: rrweb/network@1",
        pluginName: "rrweb/network@1",
        sourceEventIndexes: [2],
        type: 6,
      }),
      technicalGroup({
        key: "console",
        label: "Plugin: rrweb/console@1",
        pluginName: "rrweb/console@1",
        sourceEventIndexes: [3],
        type: 6,
      }),
    ];

    const rows = buildAllTimelineRows(groups, [networkRequest()], new Set([1]));

    expect(rows.map(row => row.key)).toContain("network:request-1");
    expect(rows.map(row => row.key)).not.toContain("technical:expanded-network");
    expect(rows.map(row => row.key)).toContain("technical:invalid-network");
    expect(rows.map(row => row.key)).toContain("technical:console");
  });

  it("uses stable network keys in every timeline", () => {
    expect(buildNetworkTimelineRows([networkRequest()])[0].key).toBe("network:request-1");
  });
});
