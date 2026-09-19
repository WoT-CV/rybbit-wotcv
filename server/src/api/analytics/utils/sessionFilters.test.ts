import { describe, expect, it } from "vitest";
import { buildFilteredSessionsCTE, getSessionFilterStatement } from "./sessionFilters.js";

const SITE_ID = 1;
const timeStatement = "AND timestamp >= toDateTime('2026-08-01 00:00:00')";

const build = (parameter: string, value: string) =>
  buildFilteredSessionsCTE(JSON.stringify([{ parameter, type: "equals", value: [value] }]), SITE_ID, timeStatement)!;

describe("buildFilteredSessionsCTE", () => {
  it("combines upstream UTM attribution with fork identity and event membership", () => {
    const sql = buildFilteredSessionsCTE(
      JSON.stringify([
        { parameter: "user_id", type: "equals", value: ["account-42"] },
        { parameter: "utm_campaign", type: "equals", value: ["launch"] },
        { parameter: "pathname", type: "equals", value: ["/pricing"] },
      ]),
      SITE_ID,
      timeStatement
    )!;
    expect(sql).toContain("dictGetOrDefault('user_identity_dict'");
    expect(sql).toContain("toUInt64(events.site_id)");
    expect(sql).toContain("argMinIf(url_parameters['utm_campaign']");
    expect(sql).toContain("AS utm_campaign");
    expect(sql).toContain("utm_campaign = 'launch'");
    expect(sql).toContain("session_id IN");
    expect(sql).toContain("pathname = '/pricing'");
    expect(sql).toContain("if(identified_user_id != '', identified_user_id, user_id) = 'account-42'");
  });
  it("resolves historical identity within the site-scoped aggregate, not its outer filter", () => {
    const sql = build("user_id", "account-42");
    expect(sql).toContain("WHERE site_id = 1");
    expect(sql).toContain(timeStatement);
    expect(sql).toContain("argMax(events.user_id, timestamp_ms) AS user_id");
    expect(sql).toContain("dictGetOrDefault('user_identity_dict'");
    expect(sql).toContain("toUInt64(events.site_id)");
    expect(sql).toContain("AS identified_user_id");
    expect(sql).toContain("WHERE 1 = 1 AND if(identified_user_id != '', identified_user_id, user_id) = 'account-42'");
    const outer = sql.slice(sql.lastIndexOf("WHERE 1 = 1"));
    expect(outer).not.toContain("dictGet");
  });

  it("filters an already-resolved session without requiring an unavailable site_id", () => {
    const filters = JSON.stringify([{ parameter: "user_id", type: "not_equals", value: ["account-42"] }]);
    const sql = getSessionFilterStatement(filters, SITE_ID, timeStatement);
    expect(sql).toBe("AND if(identified_user_id != '', identified_user_id, user_id) != 'account-42'");
  });
  it("projects only the aggregate needed by a UTM filter", () => {
    const sql = build("utm_campaign", "launch");

    expect(sql).toContain(
      "argMinIf(url_parameters['utm_campaign'], timestamp, url_parameters['utm_campaign'] != '') AS utm_campaign"
    );
    expect(sql).not.toContain("argMax(browser,");
    expect(sql).not.toContain("AS utm_source");
    expect(sql).not.toContain("feature_flags");
  });

  it("projects the component columns needed by transformed filters", () => {
    const sql = build("browser_version", "Chrome 140");

    expect(sql).toContain("argMax(browser, timestamp) AS browser");
    expect(sql).toContain("argMax(browser_version, timestamp) AS browser_version");
    expect(sql).not.toContain("argMax(country,");
  });

  it("uses membership subqueries without projecting unrelated event fields", () => {
    const sql = build("pathname", "/pricing");

    expect(sql).toContain("session_id IN (");
    expect(sql).toContain("pathname = '/pricing'");
    expect(sql).not.toContain("argMax(pathname,");
    expect(sql).not.toContain("argMax(browser,");
  });
});
