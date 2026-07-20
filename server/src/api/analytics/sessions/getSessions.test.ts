import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveUserIdentity: vi.fn(),
}));

vi.mock("../../../services/userIdentity/userIdentityService.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../services/userIdentity/userIdentityService.js")>()),
  resolveUserIdentity: mocks.resolveUserIdentity,
}));

import { buildSessionsQuery } from "./getSessions.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveUserIdentity.mockResolvedValue({
    canonicalUserId: "account-42",
    anonymousIds: ["device-a", "device-b"],
  });
});

describe("buildSessionsQuery", () => {
  it("immediately returns linked anonymous sessions as the canonical user", async () => {
    const querySpec = await buildSessionsQuery(
      {
        user_id: "device-a",
        start_date: "",
        end_date: "",
        time_zone: "UTC",
        filters: "",
        page: 1,
        limit: 25,
      },
      42
    );

    expect(mocks.resolveUserIdentity).toHaveBeenCalledWith(42, "device-a");
    expect(querySpec.query).toContain("events.identified_user_id = {canonicalUserId:String}");
    expect(querySpec.query).toContain("events.user_id IN ({anonymousIds:Array(String)})");
    expect(querySpec.query).toContain("argMax({canonicalUserId:String}, timestamp) AS identified_user_id");
    expect(querySpec.params).toMatchObject({
      siteId: 42,
      canonicalUserId: "account-42",
      anonymousIds: ["device-a", "device-b"],
    });
  });

  it("keeps dictionary-based resolution for the unfiltered sessions list", async () => {
    const querySpec = await buildSessionsQuery(
      {
        start_date: "",
        end_date: "",
        time_zone: "UTC",
        filters: "",
        page: 1,
        limit: 25,
      },
      42
    );

    expect(mocks.resolveUserIdentity).not.toHaveBeenCalled();
    expect(querySpec.query).toContain("dictGetOrDefault('user_identity_dict'");
    expect(querySpec.params).not.toHaveProperty("canonicalUserId");
    expect(querySpec.params).not.toHaveProperty("anonymousIds");
  });
});
