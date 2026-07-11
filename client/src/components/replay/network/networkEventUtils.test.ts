import { describe, expect, it } from "vitest";

import {
  filterNetworkRequests,
  getNetworkTransferSizeInfo,
  getResponseCorrelationId,
} from "./networkEventUtils";
import type { NetworkRequestFilters, ParsedNetworkRequest } from "./types";

const request = (overrides: Partial<ParsedNetworkRequest> = {}): ParsedNetworkRequest => ({
  completedAt: 1_100,
  currentUrl: "https://wot-cv.com/players-to-check",
  durationMs: 100,
  endOffset: 100,
  host: "api.wot-cv.com",
  initiatorType: "fetch",
  method: "GET",
  outcome: "success",
  requestHeaders: {},
  requestId: "request-1",
  responseHeaders: {},
  schemaVersion: 1,
  searchText: "get api.wot-cv.com /web/api/players",
  startOffset: 0,
  startedAt: 1_000,
  status: 200,
  url: "https://api.wot-cv.com/web/api/players",
  ...overrides,
});

const filters: NetworkRequestFilters = {
  fetchXhrOnly: false,
  host: "all",
  initiatorType: "all",
  method: "all",
  minDurationMs: 0,
  query: "",
  statusGroup: "all",
};

describe("network event utilities", () => {
  it("combines host, method, status and duration filters", () => {
    const requests = [
      request(),
      request({ host: "machnium.wot-cv.com", method: "POST", requestId: "request-2", status: 500 }),
    ];

    expect(
      filterNetworkRequests(requests, {
        ...filters,
        host: "machnium.wot-cv.com",
        method: "POST",
        minDurationMs: 50,
        statusGroup: "errors",
      }),
    ).toEqual([requests[1]]);
  });

  it("reads correlation IDs case-insensitively", () => {
    expect(getResponseCorrelationId(request({ responseHeaders: { "X-Correlation-ID": "trace-42" } }))).toBe(
      "trace-42",
    );
  });

  it("prefers performance transfer size and falls back to content length", () => {
    expect(
      getNetworkTransferSizeInfo(
        request({ responseHeaders: { "content-length": "120" }, sizes: { transferSize: 250 } }),
      ),
    ).toEqual({ bytes: 250, source: "performance" });
    expect(getNetworkTransferSizeInfo(request({ responseHeaders: { "content-length": "120" } }))).toEqual({
      bytes: 120,
      source: "content-length",
    });
  });
});
