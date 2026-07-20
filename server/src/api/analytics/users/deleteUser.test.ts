import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveUserIdentity: vi.fn(),
  command: vi.fn(),
  deleteWhere: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../../db/clickhouse/clickhouse.js", () => ({
  clickhouse: {
    command: mocks.command,
    query: vi.fn(),
  },
}));

vi.mock("../../../db/postgres/postgres.js", () => ({
  db: {
    delete: mocks.delete,
  },
}));

vi.mock("../../../services/storage/r2StorageService.js", () => ({
  r2Storage: {
    isEnabled: () => false,
    deleteBatch: vi.fn(),
  },
}));

vi.mock("../../../services/userIdentity/userIdentityService.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../services/userIdentity/userIdentityService.js")>()),
  resolveUserIdentity: mocks.resolveUserIdentity,
}));

import { deleteUser } from "./deleteUser.js";

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveUserIdentity.mockResolvedValue({
    canonicalUserId: "account-42",
    anonymousIds: ["device-a", "device-b"],
  });
  mocks.command.mockResolvedValue(undefined);
  mocks.deleteWhere.mockResolvedValue(undefined);
  mocks.delete.mockReturnValue({ where: mocks.deleteWhere });
});

describe("deleteUser", () => {
  it("erases the canonical account when the route contains one of its anonymous aliases", async () => {
    const reply = replyStub();
    const request = {
      params: { siteId: "42", userId: "device-a" },
      log: { error: vi.fn() },
    } as any;

    await deleteUser(request, reply);

    expect(mocks.resolveUserIdentity).toHaveBeenCalledWith(42, "device-a");
    expect(mocks.command).toHaveBeenCalledTimes(3);
    for (const [call] of mocks.command.mock.calls) {
      expect(call.query_params).toEqual({
        siteId: 42,
        canonicalUserId: "account-42",
        anonymousIds: ["device-a", "device-b"],
      });
      expect(call.query).toContain("identified_user_id = {canonicalUserId:String}");
      expect(call.query).toContain("user_id IN ({anonymousIds:Array(String)})");
    }
    expect(mocks.delete).toHaveBeenCalledTimes(2);
    expect(reply.body).toEqual({ success: true });
  });
});
