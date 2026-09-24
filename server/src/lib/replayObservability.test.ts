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

const wotcvProfile = {
  requestOrigin: "https://api.wot-cv.com",
  grafanaUrl: "https://dashboard.wot-cv.com",
  orgId: 1,
  lokiDatasourceUid: "bet3mn133whkwd",
  tempoDatasourceUid: "df0rqhtz9e3uoa",
  serviceName: "wot-cv-be-prod",
  environment: "prod",
  timePaddingMs: 120_000,
};

describe("replay observability configuration", () => {
  it.each([undefined, "", " \t\n"])("uses the WoT-CV production defaults for an unset or blank value (%j)", value => {
    expect(parseReplayObservabilityProfiles(value, 2)).toEqual([wotcvProfile]);
  });
  it.each([0, 1, 3, -1, 2.5, NaN, Infinity])("does not expose the production defaults to another site (%s)", siteId => {
    expect(parseReplayObservabilityProfiles(undefined, siteId)).toEqual([]);
  });
  it.each(["[]", " \n [ ] \t"])("allows an explicit empty array to disable all defaults (%j)", value => {
    expect(parseReplayObservabilityProfiles(value, 2)).toEqual([]);
  });
  it("does not allow a caller to mutate subsequent default profiles", () => {
    const [actual] = parseReplayObservabilityProfiles(undefined, 2);
    actual.grafanaUrl = "https://other.example.com";
    actual.lokiDatasourceUid = "other-logs";
    expect(parseReplayObservabilityProfiles(undefined, 2)).toEqual([wotcvProfile]);
  });
  it("replaces defaults with explicit profiles and only exposes them for the authorized site", () => {
    expect(parseReplayObservabilityProfiles(JSON.stringify([profile]), 3)).toEqual([]);
    expect(parseReplayObservabilityProfiles(JSON.stringify([{ ...profile, siteIds: [3] }]), 2)).toEqual([]);
    const profiles = parseReplayObservabilityProfiles(JSON.stringify([profile]), 2);
    expect(profiles).toHaveLength(1);
    const [actual] = profiles;
    expect(actual).toMatchObject({
      requestOrigin: "https://api.example.com",
      grafanaUrl: "https://grafana.example.com/grafana",
      timePaddingMs: 120_000,
    });
    expect(actual).not.toHaveProperty("siteIds");
    expect(actual).not.toHaveProperty("tempoDatasourceUid");
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
  it.each(["not-json", "null", "{}", '""', "[null]", "x".repeat(65_537)])(
    "rejects malformed and oversized configuration without falling back to production (case %#)",
    value => {
      expect(() => parseReplayObservabilityProfiles(value, 2)).toThrow();
    }
  );
  it("rejects oversized valid JSON instead of bypassing the input limit", () => {
    expect(() => parseReplayObservabilityProfiles(`[]${" ".repeat(65_536)}`, 2)).toThrow();
  });
});
