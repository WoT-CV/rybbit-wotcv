import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sessionGetOrCreate: vi.fn(),
  sessionResolveIdentified: vi.fn(),
  quit: vi.fn(),
}));

vi.mock("../../db/redis/redis.js", () => ({
  sessionRedis: { quit: mocks.quit },
  sessionGetOrCreate: (...args: unknown[]) => mocks.sessionGetOrCreate(...args),
  sessionResolveIdentified: (...args: unknown[]) => mocks.sessionResolveIdentified(...args),
}));

import { SessionsService } from "./sessionsService.js";

const SESSION_TTL_MS = 30 * 60 * 1000;

describe("SessionsService (Redis-backed)", () => {
  let service: SessionsService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    mocks.sessionGetOrCreate.mockReset();
    mocks.sessionResolveIdentified.mockReset();
    mocks.quit.mockReset();
    service = new SessionsService({ identityContinuationGraceMs: 30_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the session id resolved by Redis and refreshes its TTL", async () => {
    mocks.sessionGetOrCreate.mockResolvedValue("sess-existing");

    const result = await service.updateSession({ userId: "user-a", siteId: 42 });

    expect(result.sessionId).toBe("sess-existing");
    expect(mocks.sessionGetOrCreate).toHaveBeenCalledTimes(1);
    const [key, candidate, ttl] = mocks.sessionGetOrCreate.mock.calls[0];
    expect(key).toBe("session:42:user-a");
    expect(typeof candidate).toBe("string");
    expect(candidate).toHaveLength(14); // nanoid(14) candidate
    expect(ttl).toBe(SESSION_TTL_MS);
  });

  it("namespaces the Redis key by site and user", async () => {
    mocks.sessionGetOrCreate.mockResolvedValue("x");

    await service.updateSession({ userId: "u1", siteId: 1 });
    await service.updateSession({ userId: "u1", siteId: 2 });
    await service.updateSession({ userId: "u2", siteId: 1 });

    const keys = mocks.sessionGetOrCreate.mock.calls.map(c => c[0]);
    expect(keys).toEqual(["session:1:u1", "session:2:u1", "session:1:u2"]);
  });

  it("keeps the anonymous Redis key unchanged when identified user ID is empty", async () => {
    mocks.sessionGetOrCreate.mockResolvedValue("x");

    await service.updateSession({ userId: "anonymous-user", identifiedUserId: "", siteId: 42 });

    expect(mocks.sessionGetOrCreate.mock.calls[0][0]).toBe("session:42:anonymous-user");
  });

  it("separates identified users that share the same anonymous fingerprint", async () => {
    mocks.sessionResolveIdentified
      .mockResolvedValueOnce({
        sessionId: "alice-session",
        status: "created",
        continuationGapMs: null,
        ownerClaimed: true,
      })
      .mockResolvedValueOnce({
        sessionId: "bob-session",
        status: "created-conflict",
        continuationGapMs: null,
        ownerClaimed: false,
      });

    await service.updateSession({ userId: "shared-fingerprint", identifiedUserId: "employee-alice", siteId: 42 });
    await service.updateSession({ userId: "shared-fingerprint", identifiedUserId: "employee-bob", siteId: 42 });

    const keys = mocks.sessionResolveIdentified.mock.calls.map(call => call[0] as string);
    expect(new Set(keys).size).toBe(2);
    expect(keys.every(key => key.startsWith("session:42:identified:"))).toBe(true);
    expect(keys.every(key => !key.includes("employee-alice") && !key.includes("employee-bob"))).toBe(true);
  });

  it("separates the same identified user across distinct anonymous fingerprints", async () => {
    mocks.sessionResolveIdentified
      .mockResolvedValueOnce({
        sessionId: "device-a-session",
        status: "created",
        continuationGapMs: null,
        ownerClaimed: true,
      })
      .mockResolvedValueOnce({
        sessionId: "device-b-session",
        status: "created",
        continuationGapMs: null,
        ownerClaimed: true,
      });

    await service.updateSession({ userId: "device-a", identifiedUserId: "employee-alice", siteId: 42 });
    await service.updateSession({ userId: "device-b", identifiedUserId: "employee-alice", siteId: 42 });

    const keys = mocks.sessionResolveIdentified.mock.calls.map(call => call[0]);
    expect(new Set(keys).size).toBe(2);
  });

  it("keeps colliding identified users separate during a Redis outage", async () => {
    mocks.sessionResolveIdentified.mockRejectedValue(new Error("redis down"));

    const alice = await service.updateSession({
      userId: "shared-fingerprint",
      identifiedUserId: "employee-alice",
      siteId: 42,
    });
    const bob = await service.updateSession({
      userId: "shared-fingerprint",
      identifiedUserId: "employee-bob",
      siteId: 42,
    });

    expect(alice.sessionId).not.toBe(bob.sessionId);
  });

  it("continues a recent anonymous session when the visitor becomes identified", async () => {
    mocks.sessionResolveIdentified.mockResolvedValue({
      sessionId: "sess-anonymous",
      status: "continued",
      continuationGapMs: 4_500,
      ownerClaimed: true,
    });

    const result = await service.updateSession({
      userId: "browser-fingerprint",
      identifiedUserId: "employee-alice",
      siteId: 42,
    });

    expect(result).toEqual({
      sessionId: "sess-anonymous",
      status: "continued",
      continuationGapMs: 4_500,
    });
    const [identifiedKey, anonymousKey, ownerKey, candidate, ttlMs, graceMs, identityHash] =
      mocks.sessionResolveIdentified.mock.calls[0];
    expect(identifiedKey).toMatch(/^session:42:identified:[a-f0-9]{64}$/);
    expect(anonymousKey).toBe("session:42:browser-fingerprint");
    expect(ownerKey).toMatch(/^session:42:identity-owner:[a-f0-9]{64}$/);
    expect(candidate).toHaveLength(14);
    expect(ttlMs).toBe(SESSION_TTL_MS);
    expect(graceMs).toBe(30_000);
    expect(identityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps a new identified session when the anonymous gap is too long", async () => {
    mocks.sessionResolveIdentified.mockResolvedValue({
      sessionId: "sess-new",
      status: "created-gap",
      continuationGapMs: 30_001,
      ownerClaimed: true,
    });

    const result = await service.updateSession({
      userId: "browser-fingerprint",
      identifiedUserId: "employee-alice",
      siteId: 42,
    });

    expect(result).toEqual({
      sessionId: "sess-new",
      status: "created-gap",
      continuationGapMs: 30_001,
    });
  });

  it("caps the configurable continuation window at two minutes", async () => {
    service = new SessionsService({ identityContinuationGraceMs: 999_999 });
    mocks.sessionResolveIdentified.mockResolvedValue({
      sessionId: "sess-capped",
      status: "created",
      continuationGapMs: null,
      ownerClaimed: true,
    });

    await service.updateSession({
      userId: "browser-fingerprint",
      identifiedUserId: "employee-alice",
      siteId: 42,
    });

    expect(mocks.sessionResolveIdentified.mock.calls[0][5]).toBe(120_000);
  });

  it("allows continuation to be disabled without changing identified session isolation", async () => {
    service = new SessionsService({ identityContinuationGraceMs: 0 });
    mocks.sessionResolveIdentified.mockResolvedValue({
      sessionId: "sess-disabled",
      status: "created-gap",
      continuationGapMs: 500,
      ownerClaimed: true,
    });

    const result = await service.updateSession({
      userId: "browser-fingerprint",
      identifiedUserId: "employee-alice",
      siteId: 42,
    });

    expect(mocks.sessionResolveIdentified.mock.calls[0][5]).toBe(0);
    expect(result).toMatchObject({ sessionId: "sess-disabled", status: "created-gap" });
  });

  it("continues the cached anonymous session during a Redis outage within the grace window", async () => {
    mocks.sessionGetOrCreate.mockResolvedValueOnce("sess-real");
    const anonymous = await service.updateSession({ userId: "browser-fingerprint", siteId: 42 });

    vi.setSystemTime(new Date(Date.now() + 5_000));
    mocks.sessionResolveIdentified.mockRejectedValueOnce(new Error("redis down"));
    const identified = await service.updateSession({
      userId: "browser-fingerprint",
      identifiedUserId: "employee-alice",
      siteId: 42,
    });

    expect(anonymous.sessionId).toBe("sess-real");
    expect(identified).toEqual({
      sessionId: "sess-real",
      status: "continued",
      continuationGapMs: 5_000,
    });
  });

  it("does not continue the cached anonymous session after the grace window", async () => {
    mocks.sessionGetOrCreate.mockResolvedValueOnce("sess-real");
    await service.updateSession({ userId: "browser-fingerprint", siteId: 42 });

    vi.setSystemTime(new Date(Date.now() + 30_001));
    mocks.sessionResolveIdentified.mockRejectedValueOnce(new Error("redis down"));
    const identified = await service.updateSession({
      userId: "browser-fingerprint",
      identifiedUserId: "employee-alice",
      siteId: 42,
    });

    expect(identified.sessionId).not.toBe("sess-real");
    expect(identified.status).toBe("created-gap");
    expect(identified.continuationGapMs).toBe(30_001);
  });

  it("allows only one identified account to claim a cached anonymous session during an outage", async () => {
    mocks.sessionGetOrCreate.mockResolvedValueOnce("sess-anonymous");
    await service.updateSession({ userId: "shared-fingerprint", siteId: 42 });
    mocks.sessionResolveIdentified.mockRejectedValue(new Error("redis down"));

    const alice = await service.updateSession({
      userId: "shared-fingerprint",
      identifiedUserId: "employee-alice",
      siteId: 42,
    });
    const bob = await service.updateSession({
      userId: "shared-fingerprint",
      identifiedUserId: "employee-bob",
      siteId: 42,
    });

    expect(alice).toMatchObject({ sessionId: "sess-anonymous", status: "continued" });
    expect(bob.sessionId).not.toBe("sess-anonymous");
    expect(bob.status).toBe("created-conflict");
  });

  it("does not let a conflicting Redis resolution replace the fallback owner", async () => {
    mocks.sessionResolveIdentified
      .mockResolvedValueOnce({
        sessionId: "sess-alice",
        status: "continued",
        continuationGapMs: 2_000,
        ownerClaimed: true,
      })
      .mockResolvedValueOnce({
        sessionId: "sess-bob",
        status: "created-conflict",
        continuationGapMs: 2_500,
        ownerClaimed: false,
      });

    await service.updateSession({
      userId: "shared-fingerprint",
      identifiedUserId: "employee-alice",
      siteId: 42,
    });
    await service.updateSession({
      userId: "shared-fingerprint",
      identifiedUserId: "employee-bob",
      siteId: 42,
    });

    mocks.sessionResolveIdentified.mockRejectedValueOnce(new Error("redis down"));
    const charlie = await service.updateSession({
      userId: "shared-fingerprint",
      identifiedUserId: "employee-charlie",
      siteId: 42,
    });

    expect(charlie.status).toBe("created-conflict");
    expect(charlie.sessionId).not.toBe("sess-alice");
  });

  it("falls back to a window-stable id when Redis fails, without throwing", async () => {
    mocks.sessionGetOrCreate.mockRejectedValue(new Error("redis down"));

    const first = await service.updateSession({ userId: "user-b", siteId: 7 });
    // Still within the sliding window → same fallback id, so events stay grouped.
    vi.setSystemTime(new Date(Date.now() + SESSION_TTL_MS - 1000));
    const second = await service.updateSession({ userId: "user-b", siteId: 7 });

    expect(first.sessionId).toBe(second.sessionId);
    expect(typeof first.sessionId).toBe("string");
    expect(first.sessionId.length).toBeGreaterThan(0);
  });

  it("reuses the real Redis session id when a later command blips, instead of splitting", async () => {
    // The core regression guard: an intermittent Redis failure must not fracture
    // a visitor into multiple sessions. The blip should inherit the real id.
    mocks.sessionGetOrCreate.mockResolvedValueOnce("sess-real");
    const ok = await service.updateSession({ userId: "user-d", siteId: 9 });

    mocks.sessionGetOrCreate.mockRejectedValueOnce(new Error("redis blip"));
    const blip = await service.updateSession({ userId: "user-d", siteId: 9 });

    expect(ok.sessionId).toBe("sess-real");
    expect(blip.sessionId).toBe("sess-real");
  });

  it("rotates the fallback id once the sliding window lapses", async () => {
    mocks.sessionGetOrCreate.mockRejectedValue(new Error("redis down"));

    const first = await service.updateSession({ userId: "user-c", siteId: 7 });
    vi.setSystemTime(new Date(Date.now() + SESSION_TTL_MS + 1000));
    const later = await service.updateSession({ userId: "user-c", siteId: 7 });

    expect(first.sessionId).not.toBe(later.sessionId);
  });

  it("closes the Redis connection on shutdown", async () => {
    mocks.quit.mockResolvedValue("OK");
    await service.close();
    expect(mocks.quit).toHaveBeenCalledTimes(1);
  });
});
