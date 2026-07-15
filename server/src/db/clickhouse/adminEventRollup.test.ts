import type { ClickHouseClient } from "@clickhouse/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeAdminEventRollup } from "./adminEventRollup.js";

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../../lib/logger/logger.js", () => ({
  createServiceLogger: () => mocks,
}));

function queryResult(names: string[]) {
  return {
    json: vi.fn().mockResolvedValue(names.map(name => ({ name }))),
  };
}

function createClient(names: string[]) {
  const query = vi.fn().mockResolvedValue(queryResult(names));
  const exec = vi.fn().mockResolvedValue(undefined);
  const client = { query, exec } as unknown as ClickHouseClient;

  return { client, query, exec };
}

describe("initializeAdminEventRollup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates and backfills the rollup when both objects are missing", async () => {
    const { client, exec } = createClient([]);

    await initializeAdminEventRollup(client);

    expect(exec).toHaveBeenCalledTimes(4);
    expect(exec.mock.calls[0][0].query).toContain("CREATE TABLE IF NOT EXISTS hourly_events_by_site_mv_target");
    expect(exec.mock.calls[1][0].query).toBe("TRUNCATE TABLE hourly_events_by_site_mv_target");
    expect(exec.mock.calls[2][0].query).toContain("INSERT INTO hourly_events_by_site_mv_target");
    expect(exec.mock.calls[3][0].query).toContain("CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_events_by_site_mv");
  });

  it("does not rebuild a complete rollup", async () => {
    const { client, exec } = createClient(["hourly_events_by_site_mv_target", "hourly_events_by_site_mv"]);

    await initializeAdminEventRollup(client);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][0].query).toContain("CREATE TABLE IF NOT EXISTS hourly_events_by_site_mv_target");
  });

  it("rebuilds a target left without its materialized view", async () => {
    const { client, exec } = createClient(["hourly_events_by_site_mv_target"]);

    await initializeAdminEventRollup(client);

    expect(exec.mock.calls.map(call => call[0].query)).toEqual(
      expect.arrayContaining([
        "TRUNCATE TABLE hourly_events_by_site_mv_target",
        expect.stringContaining("INSERT INTO hourly_events_by_site_mv_target"),
        expect.stringContaining("CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_events_by_site_mv"),
      ])
    );
  });

  it("drops an orphaned view before recreating the target", async () => {
    const { client, exec } = createClient(["hourly_events_by_site_mv"]);

    await initializeAdminEventRollup(client);

    expect(exec.mock.calls[0][0].query).toBe("DROP TABLE IF EXISTS hourly_events_by_site_mv");
    expect(exec.mock.calls[1][0].query).toContain("CREATE TABLE IF NOT EXISTS hourly_events_by_site_mv_target");
  });
});
