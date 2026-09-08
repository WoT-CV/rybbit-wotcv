import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveUserIdentity: vi.fn(),
  runAnalyticsQuery: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../../../db/postgres/postgres.js", () => ({
  db: { select: mocks.select },
}));

vi.mock("../../../services/userIdentity/userIdentityService.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../services/userIdentity/userIdentityService.js")>()),
  resolveUserIdentity: mocks.resolveUserIdentity,
}));

vi.mock("../utils/analyticsQuery.js", () => ({
  runAnalyticsQuery: mocks.runAnalyticsQuery,
}));

import { buildUserInfoQueries, getUserInfo } from "./getUserInfo.js";

const emptyAggregate = {
  event_rows: 0,
  sessions: 0,
  duration: null,
  user_id: "",
  identified_user_id: "",
  first_seen: "1970-01-01 00:00:00",
  last_seen: "1970-01-01 00:00:00",
  pageviews: 0,
  events: 0,
};

function replyStub() {
  const reply: any = { statusCode: 200 };
  reply.status = vi.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = vi.fn((body: unknown) => {
    reply.body = body;
    return reply;
  });
  return reply;
}

function requestStub(userId = "missing-user") {
  return {
    params: { siteId: "42", userId },
    query: {},
    log: { error: vi.fn() },
  } as any;
}

function mockPostgresResults(profile: unknown[], aliases: unknown[]) {
  mocks.select
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: async () => profile }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: async () => aliases,
      }),
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveUserIdentity.mockResolvedValue({ canonicalUserId: "account-42", anonymousIds: ["device-a"] });
  mocks.runAnalyticsQuery
    .mockResolvedValueOnce([emptyAggregate])
    .mockResolvedValueOnce([{ performance_events: 0 }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
});

describe("getUserInfo", () => {
  it("counts source events so an empty ClickHouse aggregate can be distinguished from a real user", () => {
    const { sessionsQuery } = buildUserInfoQueries({ start_date: "", end_date: "", time_zone: "UTC", filters: "" }, 42);

    expect(sessionsQuery).toContain("count() AS event_rows");
    expect(sessionsQuery).toContain("SUM(event_rows) AS event_rows");
    expect(sessionsQuery).toContain("source_events.identified_user_id = {canonicalUserId:String}");
    expect(sessionsQuery).toContain("source_events.user_id IN ({anonymousIds:Array(String)})");
  });

  it("keeps all user panels on the same site-scoped session cohort and qualified identity", () => {
    const queries = buildUserInfoQueries(
      {
        start_date: "",
        end_date: "",
        filters: JSON.stringify([{ parameter: "user_id", type: "equals", value: ["account-42"] }]),
        time_zone: "UTC",
      },
      42
    );

    for (const sql of Object.values(queries)) {
      expect(sql).toContain("FilteredSessions AS");
      expect(sql).toContain("WHERE site_id = 42");
      expect(sql).toContain("INNER JOIN FilteredSessions USING (session_id)");
      expect(sql).toContain("AND source_events.site_id = {site:Int32}");
      expect(sql).toContain("source_events.identified_user_id = {canonicalUserId:String}");
      expect(sql).toContain("source_events.identified_user_id = ''");
      expect(sql).toContain("source_events.user_id IN ({anonymousIds:Array(String)})");
      expect(sql).not.toMatch(/(?<!source_)events\.identified_user_id = \{canonicalUserId:String\}/);
    }
  });

  it("returns 404 for an ID with neither analytics data nor a persisted identity", async () => {
    mockPostgresResults([], []);
    const reply = replyStub();

    await getUserInfo(requestStub(), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.body).toEqual({ error: "User not found" });
  });

  it("returns a zero-session profile without leaking epoch-zero timestamps", async () => {
    mockPostgresResults([{ traits: { name: "Alice" } }], []);
    const reply = replyStub();

    await getUserInfo(requestStub("account-42"), reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.body.data).toMatchObject({
      user_id: "account-42",
      identified_user_id: "account-42",
      traits: { name: "Alice" },
      sessions: 0,
      first_seen: "",
      last_seen: "",
    });
    expect(reply.body.data).not.toHaveProperty("event_rows");
  });
});
