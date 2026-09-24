import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), key: vi.fn(), session: vi.fn() }));
vi.mock("../../lib/auth-utils.js", () => ({
  getUserHasAccessToSite: mocks.access,
  checkApiKey: mocks.key,
  getSessionFromReq: mocks.session,
}));
vi.mock("../../lib/access.js", () => ({}));
vi.mock("../../lib/siteConfig.js", () => ({ siteConfig: {} }));
import { requireSiteAccess } from "../../lib/auth-middleware.js";
import { getReplayObservability } from "./getReplayObservability.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("authenticated replay observability configuration", () => {
  it.each([false, true])("requires real site access (%s), not a private/public replay link", async access => {
    mocks.access.mockResolvedValue(access);
    mocks.key.mockResolvedValue({ valid: false });
    mocks.session.mockResolvedValue(access ? { user: { id: "user-1" } } : null);
    vi.stubEnv("WOTCV_REPLAY_OBSERVABILITY_PROFILES", "");
    const app = Fastify();
    app.get<{ Params: { siteId: string } }>(
      "/sites/:siteId/replay-observability",
      { preHandler: requireSiteAccess({ resource: "replay", action: "read" }) },
      getReplayObservability
    );
    try {
      const response = await app.inject({
        url: "/sites/2/replay-observability",
        headers: { "x-private-key": "public-replay-key" },
      });
      expect(response.statusCode).toBe(access ? 200 : 403);
      if (access) {
        expect(response.json()).toEqual({ profiles: [] });
        expect(response.headers["cache-control"]).toBe("private, no-store");
      }
    } finally {
      await app.close();
    }
  });
  it("registers the production route with the authenticated replay chain", () => {
    const source = readFileSync(new URL("../../index.ts", import.meta.url), "utf8");
    expect(source).toContain(
      'fastify.get("/sites/:siteId/replay-observability", authReplayRead, getReplayObservability)'
    );
  });
  it("fails closed on invalid config without disclosing its contents", async () => {
    vi.stubEnv("WOTCV_REPLAY_OBSERVABILITY_PROFILES", "secret-invalid-config");
    const app = Fastify();
    app.get("/sites/:siteId/replay-observability", getReplayObservability);
    try {
      const response = await app.inject("/sites/2/replay-observability");
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain("secret-invalid-config");
    } finally {
      await app.close();
    }
  });
});
