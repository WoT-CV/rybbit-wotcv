import type { ReplayObservabilityProfile } from "./replayObservability";
import { normalizeCorrelationId, normalizeTraceId } from "./networkCorrelation";

export const REPLAY_COVERAGE_POLICY_VERSION = 1 as const;
export type ReplayCoverageState = "verified" | "unknown" | "unavailable" | "expired" | "not_applicable";
export type ReplayReplaceableField = "requestBody" | "responseBody" | "requestHeaders" | "responseHeaders" | "urlQuery";
export interface ReplayCoverageDecision {
  policyVersion: typeof REPLAY_COVERAGE_POLICY_VERSION;
  fields: Record<ReplayReplaceableField, ReplayCoverageState>;
  browserObservations: "not_applicable";
  reason: "invalid_request" | "unconfigured_origin" | "browser_only" | "missing_id" | "lookup_only";
  mayRemoveCapturedFields: false;
}

/** Coverage is independent of capture/privacy and transport. Client claims are never receipts. */
export function resolveReplayCoverage(
  input: unknown,
  profiles: readonly ReplayObservabilityProfile[] = []
): ReplayCoverageDecision {
  const result = (state: ReplayCoverageState, reason: ReplayCoverageDecision["reason"]): ReplayCoverageDecision => ({
    policyVersion: REPLAY_COVERAGE_POLICY_VERSION,
    fields: { requestBody: state, responseBody: state, requestHeaders: state, responseHeaders: state, urlQuery: state },
    browserObservations: "not_applicable",
    reason,
    mayRemoveCapturedFields: false,
  });
  if (!input || typeof input !== "object" || Array.isArray(input)) return result("unknown", "invalid_request");
  const request = input as Record<string, unknown>;
  if (
    typeof request.url !== "string" ||
    request.url.length > 8192 ||
    typeof request.method !== "string" ||
    !/^[A-Z]{1,32}$/.test(request.method)
  )
    return result("unknown", "invalid_request");
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return result("unknown", "invalid_request");
  }
  if (url.username || url.password || !["https:", "http:"].includes(url.protocol))
    return result("unknown", "invalid_request");
  const matches = profiles.filter(profile => profile.requestOrigin === url.origin);
  if (matches.length !== 1) return result("not_applicable", "unconfigured_origin");
  if (request.initiatorType !== "fetch" && request.initiatorType !== "xmlhttprequest")
    return result("not_applicable", "browser_only");
  if (request.outcome !== "success" && request.outcome !== "http_error") return result("unavailable", "browser_only");
  if (!normalizeCorrelationId(request.correlationId) && !normalizeTraceId(request.traceId))
    return result("unknown", "missing_id");
  // No archive, receipt, retention proof or server-side verification exists in this release.
  // This also applies to 2xx/401/5xx and to HTTP headers, not just bodies.
  return result("unknown", "lookup_only");
}
