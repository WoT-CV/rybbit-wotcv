import type { ReplayObservabilityProfile } from "@rybbit/shared";

import { getResponseCorrelationId } from "./networkEventUtils";
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
    const range = { from: String(Math.max(0, request.startedAt - padding)), to: String(Math.min(8.64e15, end + padding)) };
    const correlationId = getResponseCorrelationId(request);
    if (!correlationId) return undefined;
    const expr = `{service_name=${JSON.stringify(profile.serviceName)}, deployment_environment=${JSON.stringify(profile.environment)}} | http_correlation_id=${JSON.stringify(correlationId)}`;
    target.pathname = `${target.pathname.replace(/\/$/, "")}/explore`;
    target.search = new URLSearchParams({
      schemaVersion: "1",
      orgId: String(profile.orgId),
      panes: JSON.stringify({
        logs: {
          datasource: profile.lokiDatasourceUid,
          queries: [
            { refId: "A", datasource: { type: "loki", uid: profile.lokiDatasourceUid }, expr, queryType: "range" },
          ],
          range,
        },
      }),
    }).toString();
    return { logs: target.href };
  } catch {
    return undefined;
  }
}
