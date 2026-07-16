import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getConfig: vi.fn() }));

vi.mock("../../lib/const.js", () => ({ SECRET: "identity-test-secret" }));
vi.mock("../../lib/siteConfig.js", () => ({ siteConfig: { getConfig: mocks.getConfig } }));

import { userIdService } from "./userIdService.js";

describe("userIdService client IDs", () => {
  beforeEach(() => {
    mocks.getConfig.mockResolvedValue({ saltUserIds: false });
    vi.useRealTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("keeps a browser-scoped ID stable and scopes it to the site", async () => {
    await expect(userIdService.generateUserIdFromClientId("browser-123", 42)).resolves.toBe(
      createHash("sha256").update("42\0browser-123\0").digest("hex").substring(0, 32)
    );

    const firstSite = await userIdService.generateUserIdFromClientId("browser-123", 42);
    const secondSite = await userIdService.generateUserIdFromClientId("browser-123", 43);
    expect(secondSite).not.toBe(firstSite);
    await expect(userIdService.generateLegacyUserIdFromClientId("browser-123", 42)).resolves.toBe(
      createHash("sha256").update("42:browser-123:").digest("hex").substring(0, 12)
    );
  });

  it("rotates browser IDs daily when user ID salting is enabled", async () => {
    mocks.getConfig.mockResolvedValue({ saltUserIds: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
    const firstDay = await userIdService.generateUserIdFromClientId("browser-123", 42);

    vi.setSystemTime(new Date("2026-07-17T12:00:00Z"));
    const secondDay = await userIdService.generateUserIdFromClientId("browser-123", 42);

    expect(firstDay).toHaveLength(32);
    expect(secondDay).toHaveLength(32);
    expect(secondDay).not.toBe(firstDay);
  });
});
