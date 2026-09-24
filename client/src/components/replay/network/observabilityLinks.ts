import type { ReplayObservabilityProfile } from "@rybbit/shared";

import { getResponseCorrelationId, getResponseTraceId } from "./networkEventUtils";
import type { ParsedNetworkRequest } from "./types";

export function getObservabilityLinks(
  request: ParsedNetworkRequest,
  profiles: readonly ReplayObservabilityProfile[] = []
) {
  try {
    const origin = new URL(request.url).origin;
    const matches = profiles.filter(profile => profile.requestOrigin === origin);
    if (matches.length !== 1) return undefined;
    const profile = matches[0];
    const target = new URL(profile.grafanaUrl);
    if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash)
      return undefined;
    if (!Number.isSafeInteger(request.startedAt) || request.startedAt < 0 || request.startedAt > 8.64e15)
      return undefined;
    const padding = Math.min(3_600_000, Math.max(0, profile.timePaddingMs));
    if (!Number.isFinite(padding)) return undefined;
    // Bound untrusted completion times; normal HTTP operations remain well inside an hour.
    const end = Math.min(
      request.startedAt + 3_600_000,
      Math.max(request.startedAt, request.completedAt ?? request.startedAt)
    );
    if (!Number.isFinite(end)) return undefined;
    const range = {
      from: String(Math.max(0, request.startedAt - padding)),
      to: String(Math.min(8.64e15, end + padding)),
    };
    const correlationId = getResponseCorrelationId(request);
    const traceId = getResponseTraceId(request);
    if (!correlationId && !(traceId && profile.tempoDatasourceUid)) return undefined;
    target.pathname = `${target.pathname.replace(/\/$/, "")}/explore`;
    const explore = (paneId: string, type: string, uid: string, query: Record<string, string>) => {
      const url = new URL(target);
      url.search = new URLSearchParams({
        schemaVersion: "1",
        orgId: String(profile.orgId),
        panes: JSON.stringify({
          [paneId]: { datasource: uid, queries: [{ refId: "A", datasource: { type, uid }, ...query }], range },
        }),
      }).toString();
      return url.href;
    };
    return {
      logs: correlationId
        ? explore("logs", "loki", profile.lokiDatasourceUid, {
            expr: `{service_name=${JSON.stringify(profile.serviceName)}, deployment_environment=${JSON.stringify(profile.environment)}} | http_correlation_id=${JSON.stringify(correlationId)}`,
            queryType: "range",
          })
        : undefined,
      trace:
        traceId && profile.tempoDatasourceUid
          ? explore("trace", "tempo", profile.tempoDatasourceUid, {
              query: traceId,
              queryType: "traceId",
            })
          : undefined,
    };
  } catch {
    return undefined;
  }
}
