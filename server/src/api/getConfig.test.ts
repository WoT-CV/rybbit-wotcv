import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep developer .env files out of these configuration contract tests.
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

const wotcvMapboxToken = "pk.eyJ1Ijoid290LWN2IiwiYSI6ImNtcjZ3OGtyMDBsZWsyenM5aWliNmEyYW8ifQ.UlyVi6ufRJ4dmIfBzbpHHw";

describe("GET /api/config Mapbox token", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { name: "unset", value: undefined, expected: wotcvMapboxToken },
    { name: "empty", value: "", expected: wotcvMapboxToken },
    { name: "whitespace-only", value: " \t ", expected: wotcvMapboxToken },
    { name: "custom", value: "pk.custom-public-token", expected: "pk.custom-public-token" },
    { name: "padded custom", value: "  pk.custom-public-token  ", expected: "pk.custom-public-token" },
  ])("serves the correct browser token for a $name environment value", async ({ value, expected }) => {
    vi.stubEnv("MAPBOX_TOKEN", value);
    const { getConfig } = await import("./getConfig.js");
    const app = Fastify();
    app.get("/api/config", getConfig);

    try {
      const response = await app.inject({ method: "GET", url: "/api/config" });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ mapboxToken: string }>().mapboxToken).toBe(expected);
    } finally {
      await app.close();
    }
  });
});

describe("WoT-CV Mapbox configuration consistency", () => {
  const composeFallback = "${MAPBOX_TOKEN:-" + wotcvMapboxToken + "}";

  it.each([
    { path: ".env.example", setting: `MAPBOX_TOKEN=${wotcvMapboxToken}` },
    { path: "docs/.env.example", setting: `NEXT_PUBLIC_MAPBOX_TOKEN=${wotcvMapboxToken}` },
    { path: "docker-compose.yml", setting: `- MAPBOX_TOKEN=${composeFallback}` },
    { path: "docker-compose.cloud.yml", setting: `- MAPBOX_TOKEN=${composeFallback}` },
    { path: "docker-compose.cloud.yml", setting: `NEXT_PUBLIC_MAPBOX_TOKEN: ${composeFallback}` },
    { path: "docker-compose.cloud.yml", setting: `- NEXT_PUBLIC_MAPBOX_TOKEN=${composeFallback}` },
    { path: "setup.sh", setting: `MAPBOX_TOKEN="${composeFallback}"` },
    {
      path: "docs/src/components/SpinningGlobe.tsx",
      setting: `process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ||\n    "${wotcvMapboxToken}"`,
    },
  ])("keeps the public default and override wiring in $path", ({ path, setting }) => {
    const source = readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(source).toContain(setting);
  });
});
