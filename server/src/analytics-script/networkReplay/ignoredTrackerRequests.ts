import { toAbsoluteUrl } from "./utils.js";

const TRACKER_RESOURCE_PATHS = new Set(["/script.js", "/replay.js", "/metrics.js"]);

export function isIgnoredTrackerRequest(requestUrl: string, analyticsHost: string): boolean {
  try {
    const absoluteRequestUrl = new URL(toAbsoluteUrl(requestUrl));
    const absoluteAnalyticsHost = new URL(toAbsoluteUrl(analyticsHost));

    if (absoluteRequestUrl.origin !== absoluteAnalyticsHost.origin) {
      return false;
    }

    const analyticsBasePath = absoluteAnalyticsHost.pathname.replace(/\/$/, "");
    if (analyticsBasePath && !absoluteRequestUrl.pathname.startsWith(`${analyticsBasePath}/`)) {
      return false;
    }

    const relativePath = analyticsBasePath
      ? absoluteRequestUrl.pathname.slice(analyticsBasePath.length) || "/"
      : absoluteRequestUrl.pathname;

    return (
      relativePath === "/track" ||
      relativePath === "/identify" ||
      relativePath.startsWith("/session-replay/record/") ||
      relativePath.startsWith("/site/tracking-config/") ||
      /^\/site\/[^/]+\/feature-flags\/evaluate$/.test(relativePath) ||
      TRACKER_RESOURCE_PATHS.has(relativePath)
    );
  } catch {
    return false;
  }
}
