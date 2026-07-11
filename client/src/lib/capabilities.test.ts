import { describe, expect, it } from "vitest";
import { resolveAnalyticsCapabilities } from "./capabilities";

describe("resolveAnalyticsCapabilities", () => {
  it("enables extended analytics and local tools for self-hosted deployments", () => {
    expect(resolveAnalyticsCapabilities({ deployment: "self-hosted", isCloud: false })).toEqual({
      botAnalytics: true,
      customDashboards: true,
      customQueries: true,
      pageAnalytics: true,
      performanceAnalytics: true,
    });
  });

  it("keeps cloud analytics while hiding local-only tools", () => {
    const capabilities = resolveAnalyticsCapabilities({ deployment: undefined, isCloud: true });

    expect(capabilities.pageAnalytics).toBe(true);
    expect(capabilities.customQueries).toBe(false);
    expect(capabilities.customDashboards).toBe(false);
  });
});
