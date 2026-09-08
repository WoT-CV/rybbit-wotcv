import { describe, expect, it } from "vitest";
import { getTechnicalGroups, getMeaningfulEvents } from "./replayEvents";

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

const text = (id: number, textContent: string) => ({ id, type: 3, textContent });
const element = (id: number, tagName: string, label: string) => ({
  id,
  type: 2,
  tagName,
  attributes: {},
  childNodes: [text(id + 1, label)],
});

const click = (timestamp: number, id: number) => ({
  timestamp,
  type: 3,
  data: { source: 2, type: 2, id },
});

describe("getMeaningfulEvents", () => {
  it("resolves click targets against the FullSnapshot active at click time", () => {
    const events = [
      {
        timestamp: 1_000,
        type: 2,
        data: {
          node: {
            id: 1,
            type: 0,
            childNodes: [
              element(10, "summary", "$0.02 / video"),
              element(20, "summary", "Do credits expire?"),
              element(30, "summary", "What formats are available?"),
              element(40, "summary", "What is MCP and why does it matter?"),
              element(50, "summary", "Does this work with ChatGPT, Claude, Cursor..."),
            ],
          },
        },
      },
      click(2_000, 10),
      click(4_000, 20),
      click(6_000, 30),
      click(8_000, 40),
      click(10_000, 50),
      {
        timestamp: 12_000,
        type: 2,
        data: {
          node: {
            id: 1,
            type: 0,
            childNodes: [
              element(20, "a", "YouTube Bulk Transcript A product by someone"),
              element(30, "a", "Terms of Service"),
              element(40, "a", "Featured on Submitator"),
              element(50, "a", ""),
            ],
          },
        },
      },
      click(14_000, 30),
    ];

    expect(getMeaningfulEvents(events).map(event => event.detail)).toEqual([
      "“$0.02 / video”",
      "“Do credits expire?”",
      "“What formats are available?”",
      "“What is MCP and why does it matter?”",
      "“Does this work with ChatGPT, Claude, Cu…”",
      "“Terms of Service”",
    ]);
  });

  it("resolves targets added by a mutation before the click", () => {
    const events = [
      {
        timestamp: 1_000,
        type: 2,
        data: { node: { id: 1, type: 0, childNodes: [] } },
      },
      {
        timestamp: 2_000,
        type: 3,
        data: {
          source: 0,
          adds: [{ parentId: 1, node: element(60, "button", "Save changes") }],
        },
      },
      click(4_000, 60),
    ];

    expect(getMeaningfulEvents(events).map(event => event.detail)).toEqual(["“Save changes”"]);
  });
});
