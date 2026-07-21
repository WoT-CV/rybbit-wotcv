import { NETWORK_REPLAY_SCHEMA_VERSION } from "@rybbit/shared";
import { describe, expect, it } from "vitest";
import { NETWORK_PLUGIN_NAME, parseNetworkEvents, parseNetworkReplayEvents } from "./parseNetworkEvents";

describe("parseNetworkEvents", () => {
  it("normalizes valid requests and removes duplicate request IDs", () => {
    const request = {
      schemaVersion: NETWORK_REPLAY_SCHEMA_VERSION,
      requestId: "request-1",
      currentUrl: "https://wot-cv.com/players-to-check",
      url: "https://api.wot-cv.com/web/api/players",
      method: "get",
      initiatorType: "fetch",
      startedAt: 1_100,
      completedAt: 1_250,
      responseHeaders: { "x-correlation-id": "correlation-1" },
    };
    const pluginEvent = {
      timestamp: 1_300,
      type: 6,
      data: { plugin: NETWORK_PLUGIN_NAME, payload: { version: 1, requests: [request, request] } },
    };

    const result = parseNetworkEvents([{ timestamp: 1_000, type: 4 }, pluginEvent]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      durationMs: 150,
      endOffset: 250,
      host: "api.wot-cv.com",
      method: "GET",
      startOffset: 100,
    });
    expect(result[0].searchText).toContain("api.wot-cv.com");
  });

  it("ignores unsupported plugin and request schema versions", () => {
    expect(
      parseNetworkEvents([
        { timestamp: 1_000, type: 4 },
        {
          timestamp: 1_100,
          type: 6,
          data: {
            plugin: NETWORK_PLUGIN_NAME,
            payload: {
              version: 1,
              requests: [{ schemaVersion: NETWORK_REPLAY_SCHEMA_VERSION + 1, startedAt: 1_050 }],
            },
          },
        },
      ])
    ).toEqual([]);
  });

  it("reports every valid network carrier as expanded, including duplicate batches", () => {
    const request = {
      schemaVersion: NETWORK_REPLAY_SCHEMA_VERSION,
      requestId: "request-1",
      currentUrl: "https://wot-cv.com",
      url: "https://api.wot-cv.com/web/api/players",
      method: "GET",
      initiatorType: "fetch",
      startedAt: 1_100,
      completedAt: 1_200,
    };
    const pluginData = {
      plugin: NETWORK_PLUGIN_NAME,
      payload: { version: 1, requests: [request] },
    };

    const result = parseNetworkReplayEvents([
      { timestamp: 1_000, type: 4 },
      { timestamp: 1_200, type: 6, data: pluginData },
      { timestamp: 1_300, type: 6, data: pluginData },
    ]);

    expect(result.requests).toHaveLength(1);
    expect([...result.expandedEventIndexes]).toEqual([1, 2]);
  });

  it("keeps invalid network carriers unexpanded for diagnostic fallback", () => {
    const result = parseNetworkReplayEvents([
      { timestamp: 1_000, type: 4 },
      {
        timestamp: 1_100,
        type: 6,
        data: {
          plugin: NETWORK_PLUGIN_NAME,
          payload: {
            version: 1,
            requests: [{ schemaVersion: NETWORK_REPLAY_SCHEMA_VERSION + 1, startedAt: 1_050 }],
          },
        },
      },
    ]);

    expect(result.requests).toEqual([]);
    expect(result.expandedEventIndexes.size).toBe(0);
  });
});
