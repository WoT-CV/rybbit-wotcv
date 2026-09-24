import type { ReplayObservabilityProfile } from "@rybbit/shared";
import { describe, expect, it } from "vitest";

import { getObservabilityLinks } from "./observabilityLinks";
import { parseNetworkEvents } from "./parseNetworkEvents";

export const testProfile: ReplayObservabilityProfile = {
  requestOrigin: "https://api.example.com",
  grafanaUrl: "https://grafana.example.com/grafana",
  orgId: 2,
  lokiDatasourceUid: "logs",
  serviceName: "api-prod",
  environment: "prod",
  timePaddingMs: 120_000,
};
const parse = (overrides: Record<string, unknown> = {}) =>
  parseNetworkEvents([
    {
      type: 6,
      timestamp: 1_700_000_000_100,
      data: {
        plugin: "rrweb/network@1",
        payload: {
          version: 1,
          requests: [
            {
              schemaVersion: 1,
              requestId: "request-1",
              url: "https://api.example.com/players?q=private",
              startedAt: 1_700_000_000_000,
              completedAt: 1_700_000_000_100,
              correlationId: "correlation-1",
              ...overrides,
            },
          ],
        },
      },
    },
  ])[0];

describe("Grafana links", () => {
  it("uses an absolute time range, configured datasource and environment, not the URL query", () => {
    const url = new URL(getObservabilityLinks(parse(), [testProfile])!.logs!);
    expect(url.origin).toBe("https://grafana.example.com");
    expect(url.pathname).toBe("/grafana/explore");
    expect(url.searchParams.get("orgId")).toBe("2");
    const pane = JSON.parse(url.searchParams.get("panes")!).logs;
    expect(pane.range).toEqual({ from: "1699999880000", to: "1700000120100" });
    expect(pane.queries[0].expr).toBe(
      '{service_name="api-prod", deployment_environment="prod"} | http_correlation_id="correlation-1"'
    );
    expect(url.href).not.toContain("private");
  });
  it("supports historical recordings with only a response header", () => {
    expect(
      getObservabilityLinks(parse({ correlationId: undefined, responseHeaders: { "X-Correlation-Id": "old-id" } }), [
        testProfile,
      ])?.logs
    ).toContain("old-id");
  });
  it("prefers valid explicit metadata over legacy headers", () => {
    expect(
      getObservabilityLinks(parse({ responseHeaders: { "x-correlation-id": "old-id" } }), [testProfile])?.logs
    ).toContain("correlation-1");
  });
  it.each([
    "https://api.example.com.attacker.test/x",
    "https://other.example.com/x",
    "http://api.example.com/x",
    "not-a-url",
  ])("does not match an unconfigured origin %s", url => {
    expect(getObservabilityLinks(parse({ url }), [testProfile])).toBeUndefined();
  });
  it("does not fabricate IDs or link failed, uncorrelated requests", () => {
    expect(
      getObservabilityLinks(parse({ correlationId: undefined, outcome: "network_error" }), [testProfile])
    ).toBeUndefined();
    expect(getObservabilityLinks(parse({ correlationId: 'x" } |= "' }), [testProfile])).toBeUndefined();
    expect(getObservabilityLinks(parse())).toBeUndefined();
    expect(getObservabilityLinks(parse(), [testProfile, testProfile])).toBeUndefined();
  });
  it.each([
    "http://grafana.example.com",
    "https://user:pass@grafana.example.com",
    "https://grafana.example.com?token=secret",
    "javascript:alert(1)",
  ])("rejects unsafe targets %s", grafanaUrl => {
    expect(getObservabilityLinks(parse(), [{ ...testProfile, grafanaUrl }])).toBeUndefined();
  });
  it("bounds untrusted times and rejects invalid timestamps", () => {
    expect(getObservabilityLinks({ ...parse(), startedAt: NaN }, [testProfile])).toBeUndefined();
    const url = new URL(getObservabilityLinks({ ...parse(), completedAt: 8e15 }, [testProfile])!.logs!);
    expect(JSON.parse(url.searchParams.get("panes")!).logs.range.to).toBe("1700003720000");
  });
  it("links real traces independently of log correlation and preserves absolute time", () => {
    const profile = { ...testProfile, tempoDatasourceUid: "tempo-prod" };
    const links = getObservabilityLinks(parse({ correlationId: undefined, traceId: "a".repeat(32) }), [profile])!;
    expect(links.logs).toBeUndefined();
    const url = new URL(links.trace!);
    const pane = JSON.parse(url.searchParams.get("panes")!).trace;
    expect(pane.datasource).toBe("tempo-prod");
    expect(pane.queries).toEqual([
      { refId: "A", datasource: { type: "tempo", uid: "tempo-prod" }, queryType: "traceId", query: "a".repeat(32) },
    ]);
    expect(pane.range).toEqual({ from: "1699999880000", to: "1700000120100" });
  });
  it("uses historical trace headers but never turns a correlation ID into a trace", () => {
    const profile = { ...testProfile, tempoDatasourceUid: "tempo-prod" };
    expect(
      getObservabilityLinks(parse({ responseHeaders: { "X-Trace-Id": "A".repeat(32) } }), [profile])?.trace
    ).toBeDefined();
    expect(getObservabilityLinks(parse({ correlationId: "a".repeat(32) }), [profile])?.trace).toBeUndefined();
    expect(getObservabilityLinks(parse({ traceId: "0".repeat(32) }), [profile])?.trace).toBeUndefined();
    expect(getObservabilityLinks(parse({ traceId: "a".repeat(32) }), [testProfile])?.trace).toBeUndefined();
  });
});
