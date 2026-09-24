import { ExternalLink } from "lucide-react";
import { useExtracted } from "next-intl";
import { resolveReplayCoverage } from "@rybbit/shared";

import { useReplayObservability } from "@/api/admin/hooks/useReplayObservability";
import { Button } from "@/components/ui/button";

import { getObservabilityLinks } from "./observabilityLinks";
import type { ParsedNetworkRequest } from "./types";
import { getResponseCorrelationId, getResponseTraceId } from "./networkEventUtils";

export function NetworkObservabilityLinks({ request }: { request: ParsedNetworkRequest }) {
  const t = useExtracted();
  const profiles = useReplayObservability();
  const links = getObservabilityLinks(request, profiles);
  const coverage = resolveReplayCoverage(
    { ...request, correlationId: getResponseCorrelationId(request), traceId: getResponseTraceId(request) },
    profiles
  );
  if (!links) return null;
  return (
    <div
      className="space-y-2 border-b border-neutral-100 p-2 dark:border-neutral-800"
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="flex flex-wrap gap-2">
        {links.logs && (
          <Button asChild size="sm" variant="outline">
            <a href={links.logs} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
              <ExternalLink aria-hidden="true" />
              {t("Open logs in Grafana")}
            </a>
          </Button>
        )}
        {links.trace && (
          <Button asChild size="sm" variant="outline">
            <a href={links.trace} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
              <ExternalLink aria-hidden="true" />
              {t("Open trace in Grafana")}
            </a>
          </Button>
        )}
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {t("Grafana access is required. Logs may expire before this replay.")}
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {coverage.fields.responseBody === "unavailable"
          ? t("This browser request may not have reached the backend. Its body is not confirmed in Grafana.")
          : t(
              "These links search logs and traces; they do not confirm that bodies, headers or URL parameters were saved."
            )}
      </p>
    </div>
  );
}
