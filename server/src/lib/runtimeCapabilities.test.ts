import { describe, expect, it } from "vitest";
import { getRuntimeCapabilities } from "./runtimeCapabilities.js";

describe("getRuntimeCapabilities", () => {
  it.each([
    [{}, false, false],
    [{ ENABLE_UNCLAIMED_SITES: "true" }, false, true],
    [{ ENABLE_UNCLAIMED_SITES: "false" }, true, false],
    [{ ENABLE_UNCLAIMED_SITES: "" }, true, false],
    [{ ENABLE_UNCLAIMED_SITES: "invalid" }, true, false],
    [{}, true, true],
    [{ DISABLE_SIGNUP: "true" }, true, false],
    [{ ENABLE_UNCLAIMED_SITES: "true", DISABLE_SIGNUP: "true" }, false, false],
  ])("gates anonymous onboarding (%j, cloud=%s)", (env, cloud, expected) => {
    expect(getRuntimeCapabilities(env, cloud).unclaimedSites).toBe(expected);
  });
  it("keeps optional self-hosted capabilities disabled without configuration", () => {
    expect(getRuntimeCapabilities({}, false)).toEqual({
      googleSearchConsole: false,
      objectStorage: false,
      socialProviders: { github: false, google: false },
      transactionalEmail: false,
      turnstile: false,
      weeklyReports: false,
      unclaimedSites: false,
    });
  });

  it("enables configured self-hosted capabilities", () => {
    expect(
      getRuntimeCapabilities(
        {
          BASE_URL: "https://analytics.example.com",
          EMAIL_FROM: "Analytics <analytics@example.com>",
          ENABLE_WEEKLY_REPORTS: "true",
          GITHUB_CLIENT_ID: "github-id",
          GITHUB_CLIENT_SECRET: "github-secret",
          GOOGLE_CLIENT_ID: "google-id",
          GOOGLE_CLIENT_SECRET: "google-secret",
          R2_ACCESS_KEY_ID: "r2-key",
          R2_ACCOUNT_ID: "r2-account",
          R2_SECRET_ACCESS_KEY: "r2-secret",
          RESEND_API_KEY: "resend-key",
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
          TURNSTILE_SECRET_KEY: "turnstile-secret-key",
        },
        false
      )
    ).toEqual({
      googleSearchConsole: true,
      objectStorage: true,
      socialProviders: { github: true, google: true },
      transactionalEmail: true,
      turnstile: true,
      weeklyReports: true,
      unclaimedSites: false,
    });
  });

  it("requires explicit weekly report opt-in on self-hosted deployments", () => {
    const capabilities = getRuntimeCapabilities(
      {
        EMAIL_FROM: "Analytics <analytics@example.com>",
        RESEND_API_KEY: "resend-key",
      },
      false
    );

    expect(capabilities.transactionalEmail).toBe(true);
    expect(capabilities.weeklyReports).toBe(false);
  });
});
