import { describe, expect, it } from "vitest";

import { getTechnicalGroups } from "./replayEvents";

describe("technical replay groups", () => {
  it("preserves plugin names and source event indexes", () => {
    const groups = getTechnicalGroups([
      { timestamp: 1_000, type: 4, data: { href: "https://wot-cv.com" } },
      { timestamp: 1_100, type: 6, data: { plugin: "rrweb/network@1", payload: { version: 1, requests: [] } } },
      { timestamp: 1_200, type: 6, data: { plugin: "rrweb/console@1", payload: { level: "log" } } },
    ]);

    expect(groups[1]).toMatchObject({
      label: "Plugin: rrweb/network@1",
      pluginName: "rrweb/network@1",
      sourceEventIndexes: [1],
      type: 6,
    });
    expect(groups[2]).toMatchObject({
      label: "Plugin: rrweb/console@1",
      pluginName: "rrweb/console@1",
      sourceEventIndexes: [2],
      type: 6,
    });
  });

  it("tracks every raw event index in an incremental group", () => {
    const groups = getTechnicalGroups([
      { timestamp: 1_000, type: 4 },
      { timestamp: 1_100, type: 3, data: { source: 0 } },
      { timestamp: 1_200, type: 3, data: { source: 0 } },
    ]);

    expect(groups[1]).toMatchObject({
      count: 2,
      endOffset: 200,
      sourceEventIndexes: [1, 2],
    });
  });
});
