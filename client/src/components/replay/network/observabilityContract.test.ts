import { readResponseCorrelation, toMetadataRequest, type CapturedNetworkRequest } from "@rybbit/shared";
import { describe, expect, it } from "vitest";

import { getObservabilityLinks } from "./observabilityLinks";
import { parseNetworkEvents } from "./parseNetworkEvents";

const profile = {
  requestOrigin: "https://api.example.com",
  grafanaUrl: "https://monitoring.example.com/grafana",
  orgId: 1,
  lokiDatasourceUid: "loki-prod",
  tempoDatasourceUid: "tempo-prod",
  serviceName: "api-prod",
  environment: "prod",
  timePaddingMs: 120000,
};
const fullRequest: CapturedNetworkRequest = {
  schemaVersion: 1,
  requestId: "r1",
  url: "https://user:URL_SECRET@api.example.com/players?q=QUERY_SECRET#FRAGMENT_SECRET",
  currentUrl: "https://app.example.com/players?token=PAGE_SECRET",
  method: "POST",
  initiatorType: "fetch",
  startedAt: 1700000000000,
  completedAt: 1700000000123,
  status: 200,
  statusText: "STATUS_SECRET",
  outcome: "success",
  requestHeaders: { authorization: "AUTH_SECRET" },
  responseHeaders: { "X-Correlation-Id": "backend-id", "X-Trace-Id": "a".repeat(32), "set-cookie": "COOKIE_SECRET" },
  requestBody: { kind: "json", value: '{"token":"REQUEST_SECRET"}' },
  responseBody: { kind: "text", value: "RESPONSE_SECRET" },
  performanceEntryFound: false,
};
const serialize = (request: CapturedNetworkRequest) =>
  JSON.stringify([
    {
      type: 6,
      timestamp: 1700000000123,
      data: { plugin: "rrweb/network@1", payload: { version: 1, requests: [request] } },
    },
  ]);

describe("recorder to playback observability contract", () => {
  it("keeps only response IDs and metadata through serialization, parsing and both link builders", () => {
    const headers = new Headers(fullRequest.responseHeaders);
    const metadata = toMetadataRequest({ ...fullRequest, ...readResponseCorrelation(name => headers.get(name)) });
    const json = serialize(metadata);
    expect(json).not.toContain("SECRET");
    const parsed = parseNetworkEvents(JSON.parse(json))[0];
    expect(parsed.captureMode).toBe("metadata");
    expect(parsed.requestBody).toBeUndefined();
    expect(parsed.responseBody).toBeUndefined();
    expect(parsed.responseHeaders).toEqual({});
    expect(parsed.correlationId).toBe("backend-id");
    expect(parsed.traceId).toBe("a".repeat(32));
    const links = getObservabilityLinks(parsed, [profile])!;
    const logs = JSON.parse(new URL(links.logs!).searchParams.get("panes")!).logs;
    const trace = JSON.parse(new URL(links.trace!).searchParams.get("panes")!).trace;
    expect(logs.queries[0].expr).toContain('http_correlation_id="backend-id"');
    expect(trace.queries[0].query).toBe("a".repeat(32));
    expect(trace.range).toEqual(logs.range);
    expect(JSON.stringify(links)).not.toContain("SECRET");
  });

  it("retains historic body viewing and response-header links without rewriting the recording", () => {
    const json = serialize(fullRequest);
    const parsed = parseNetworkEvents(JSON.parse(json))[0];
    expect(parsed.responseBody?.value).toBe("RESPONSE_SECRET");
    expect(parsed.requestBody?.value).toContain("REQUEST_SECRET");
    expect(getObservabilityLinks(parsed, [profile])?.logs).toBeDefined();
    expect(getObservabilityLinks(parsed, [profile])?.trace).toBeDefined();
    expect(serialize(fullRequest)).toBe(json);
  });

  it("keeps legacy logs when the backend or CORS has no trace support", () => {
    const metadata = toMetadataRequest({
      ...fullRequest,
      ...readResponseCorrelation(name => (name === "x-correlation-id" ? "only-correlation" : null)),
    });
    const parsed = parseNetworkEvents(JSON.parse(serialize(metadata)))[0];
    const links = getObservabilityLinks(parsed, [profile])!;
    expect(links.logs).toContain("only-correlation");
    expect(links.trace).toBeUndefined();
  });
});
