import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  returning: vi.fn(),
  values: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("../../db/postgres/postgres.js", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

import {
  claimTrackerAlias,
  clickhouseEffectiveUserId,
  clickhouseResolvedIdentifiedUserId,
  clickhouseResolvedUserCondition,
} from "./userIdentityService.js";

describe("userIdentityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: mocks.limit }),
      }),
    });
    mocks.values.mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({ returning: mocks.returning }),
    });
    mocks.insert.mockReturnValue({ values: mocks.values });
  });

  it("builds a ClickHouse expression where explicit identity has precedence", () => {
    const expression = clickhouseResolvedIdentifiedUserId("events");
    expect(expression).toContain("if(events.identified_user_id != '', events.identified_user_id");
    expect(expression).toContain("dictGetOrDefault('user_identity_dict'");
    expect(expression).toContain("tuple(toUInt64(events.site_id), toString(events.user_id))");
  });

  it("falls back to the anonymous ID only when no account can be resolved", () => {
    const expression = clickhouseEffectiveUserId("events");
    expect(expression).toContain("events.user_id");
    expect(expression).toContain("dictGetOrDefault('user_identity_dict'");
  });

  it("matches a resolved account without stealing explicitly attributed events", () => {
    const condition = clickhouseResolvedUserCondition("events");

    expect(condition).toContain("events.identified_user_id = {canonicalUserId:String}");
    expect(condition).toContain("events.identified_user_id = ''");
    expect(condition).toContain("events.user_id IN ({anonymousIds:Array(String)})");
  });

  it("creates an unowned tracker alias", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    mocks.returning.mockResolvedValueOnce([{ userId: "account-13" }]);

    await expect(claimTrackerAlias(42, "browser-id", "account-13")).resolves.toEqual({ status: "created" });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 42, anonymousId: "browser-id", userId: "account-13", source: "tracker" })
    );
  });

  it("rejects an alias already owned by another account", async () => {
    mocks.limit.mockResolvedValueOnce([{ userId: "account-alice" }]);

    await expect(claimTrackerAlias(42, "browser-id", "account-bob")).resolves.toEqual({
      status: "conflict",
      existingUserId: "account-alice",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("re-reads ownership when a concurrent request wins the insert", async () => {
    mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([{ userId: "account-alice" }]);
    mocks.returning.mockResolvedValueOnce([]);

    await expect(claimTrackerAlias(42, "browser-id", "account-bob")).resolves.toEqual({
      status: "conflict",
      existingUserId: "account-alice",
    });
  });
});
