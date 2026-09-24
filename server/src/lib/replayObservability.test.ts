import { describe, expect, it } from "vitest";

import { parseReplayObservabilityProfiles } from "./replayObservability.js";

const profile = {
  siteIds: [2],
  requestOrigin: "https://api.example.com/",
  grafanaUrl: "https://grafana.example.com/grafana/",
  orgId: 1,
  lokiDatasourceUid: "logs",
  serviceName: "api-prod",
  environment: "prod",
};

describe("replay observability configuration", () => {
  it("is opt-in and only exposes profiles for the authorized site", () => {
    expect(parseReplayObservabilityProfiles(undefined, 2)).toEqual([]);
    expect(parseReplayObservabilityProfiles(JSON.stringify([profile]), 3)).toEqual([]);
    const [actual] = parseReplayObservabilityProfiles(JSON.stringify([profile]), 2);
    expect(actual).toMatchObject({
      requestOrigin: "https://api.example.com",
      grafanaUrl: "https://grafana.example.com/grafana",
      timePaddingMs: 120_000,
    });
    expect(actual).not.toHaveProperty("siteIds");
  });
  it.each([
    { grafanaUrl: "javascript:alert(1)" },
    { grafanaUrl: "https://user:pass@grafana.example.com" },
    { grafanaUrl: "https://grafana.example.com/?token=secret" },
    { grafanaUrl: "https://grafana.example.com/#token" },
    { requestOrigin: "https://api.example.com/path" },
    { serviceName: 'a"} |= "' },
    { timePaddingMs: 3_600_001 },
    { orgId: 0 },
    { siteIds: [] },
    { unknown: true },
  ])("rejects unsafe or ambiguous configuration %j", override => {
    expect(() => parseReplayObservabilityProfiles(JSON.stringify([{ ...profile, ...override }]), 2)).toThrow();
  });
  it("rejects duplicate origins for the same site, but allows independent sites", () => {
    expect(() => parseReplayObservabilityProfiles(JSON.stringify([profile, profile]), 2)).toThrow();
    expect(parseReplayObservabilityProfiles(JSON.stringify([profile, { ...profile, siteIds: [3] }]), 2)).toHaveLength(
      1
    );
  });
  it("rejects malformed and oversized configuration without silently using a different target", () => {
    expect(() => parseReplayObservabilityProfiles("not-json", 2)).toThrow();
    expect(() => parseReplayObservabilityProfiles("x".repeat(65_537), 2)).toThrow();
  });
});
