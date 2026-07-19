import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLocation: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("../../db/geolocation/geolocation.js", () => ({
  getLocation: mocks.getLocation,
}));

vi.mock("../../lib/logger/logger.js", () => ({
  logger: { warn: mocks.loggerWarn },
}));

import { decideSiteExclusion } from "./siteExclusionDecision.js";

function configuration(overrides: Partial<Parameters<typeof decideSiteExclusion>[0]> = {}) {
  return {
    excludedIPs: [],
    excludedCountries: [],
    excludedPaths: [],
    excludedHostnames: [],
    excludedUserAgents: [],
    ...overrides,
  };
}

const request = {
  ipAddress: "198.51.100.10",
  pathname: "/admin/users",
  hostname: "preview.vercel.app",
  userAgent: "Mozilla/5.0 HeadlessChrome/120",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLocation.mockResolvedValue({});
});

describe("decideSiteExclusion", () => {
  it("accepts a request when no exclusion matches without resolving geolocation", async () => {
    await expect(decideSiteExclusion(configuration(), request)).resolves.toEqual({ excluded: false });
    expect(mocks.getLocation).not.toHaveBeenCalled();
  });

  it.each([
    ["single address", "198.51.100.10"],
    ["CIDR", "198.51.100.0/24"],
    ["range", "198.51.100.1-198.51.100.20"],
  ])("matches an excluded IP using a %s rule", async (_description, pattern) => {
    await expect(decideSiteExclusion(configuration({ excludedIPs: [pattern] }), request)).resolves.toMatchObject({
      excluded: true,
      reason: "ip",
      label: "IP",
      value: "198.51.100.10",
    });
  });

  it("resolves geolocation only when country rules exist", async () => {
    mocks.getLocation.mockResolvedValue({
      "198.51.100.10": { countryIso: "us" },
    });

    await expect(decideSiteExclusion(configuration({ excludedCountries: ["US", "GB"] }), request)).resolves.toEqual({
      excluded: true,
      reason: "country",
      label: "country",
      value: "us",
    });
    expect(mocks.getLocation).toHaveBeenCalledOnce();
    expect(mocks.getLocation).toHaveBeenCalledWith(["198.51.100.10"]);
  });

  it("matches path globs case-insensitively", async () => {
    const rules = configuration({ excludedPaths: ["/admin/*", "/preview"] });

    await expect(decideSiteExclusion(rules, { ...request, pathname: "/ADMIN/users" })).resolves.toMatchObject({
      excluded: true,
      reason: "path",
    });
    await expect(decideSiteExclusion(rules, { ...request, pathname: "/preview" })).resolves.toMatchObject({
      excluded: true,
      reason: "path",
    });
    await expect(decideSiteExclusion(rules, { ...request, pathname: "/admin" })).resolves.toEqual({
      excluded: false,
    });
  });

  it("handles multiple and consecutive wildcards without regex backtracking", async () => {
    const rules = configuration({ excludedPaths: ["/a/*/b/*", "/x**y", "/" + "*a".repeat(30) + "b"] });

    await expect(decideSiteExclusion(rules, { ...request, pathname: "/a/1/b/2" })).resolves.toMatchObject({
      excluded: true,
      reason: "path",
    });
    await expect(decideSiteExclusion(rules, { ...request, pathname: "/a//b/" })).resolves.toMatchObject({
      excluded: true,
      reason: "path",
    });
    await expect(decideSiteExclusion(rules, { ...request, pathname: "/xANYTHINGy" })).resolves.toMatchObject({
      excluded: true,
      reason: "path",
    });
    await expect(decideSiteExclusion(rules, { ...request, pathname: "/" + "a".repeat(2000) })).resolves.toEqual({
      excluded: false,
    });
  });

  it("matches hostname globs", async () => {
    const rules = configuration({ excludedHostnames: ["localhost", "*.vercel.app"] });

    await expect(decideSiteExclusion(rules, request)).resolves.toMatchObject({
      excluded: true,
      reason: "hostname",
    });
    await expect(decideSiteExclusion(rules, { ...request, hostname: "vercel.app" })).resolves.toEqual({
      excluded: false,
    });
  });

  it("matches user-agent substrings case-insensitively and ignores blank rules", async () => {
    const rules = configuration({ excludedUserAgents: ["  ", "headlesschrome"] });

    await expect(decideSiteExclusion(rules, request)).resolves.toMatchObject({
      excluded: true,
      reason: "user_agent",
    });
    await expect(decideSiteExclusion(rules, { ...request, userAgent: "Mozilla/5.0 (real browser)" })).resolves.toEqual({
      excluded: false,
    });
  });

  it("returns the first exclusion in the fixed ordering and short-circuits later work", async () => {
    mocks.getLocation.mockResolvedValue({
      "198.51.100.10": { countryIso: "US" },
    });
    const rules = configuration({
      excludedIPs: ["198.51.100.0/24"],
      excludedCountries: ["US"],
      excludedPaths: ["/admin/*"],
      excludedHostnames: ["*.vercel.app"],
      excludedUserAgents: ["HeadlessChrome"],
    });

    await expect(decideSiteExclusion(rules, request)).resolves.toMatchObject({
      excluded: true,
      reason: "ip",
    });
    expect(mocks.getLocation).not.toHaveBeenCalled();
  });

  it("lets country exclusion preempt matching request metadata", async () => {
    mocks.getLocation.mockResolvedValue({
      "198.51.100.10": { countryIso: "US" },
    });
    const rules = configuration({
      excludedCountries: ["US"],
      excludedPaths: ["/admin/*"],
      excludedHostnames: ["*.vercel.app"],
      excludedUserAgents: ["HeadlessChrome"],
    });

    await expect(decideSiteExclusion(rules, request)).resolves.toMatchObject({
      excluded: true,
      reason: "country",
    });
  });

  it("propagates geolocation failures", async () => {
    mocks.getLocation.mockRejectedValue(new Error("geolocation unavailable"));

    await expect(decideSiteExclusion(configuration({ excludedCountries: ["US"] }), request)).rejects.toThrow(
      "geolocation unavailable"
    );
  });
});
