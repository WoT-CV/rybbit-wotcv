import { ExternalLink } from "lucide-react";
import { useExtracted } from "next-intl";

import { useReplayObservability } from "@/api/admin/hooks/useReplayObservability";
import { Button } from "@/components/ui/button";

import { getObservabilityLinks } from "./observabilityLinks";
import type { ParsedNetworkRequest } from "./types";

export function NetworkObservabilityLinks({ request }: { request: ParsedNetworkRequest }) {
  const t = useExtracted();
  const profiles = useReplayObservability();
  const links = getObservabilityLinks(request, profiles);
  if (!links) return null;
  return (
    <div className="space-y-2 border-b border-neutral-100 p-2 dark:border-neutral-800">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={links.logs} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            <ExternalLink aria-hidden="true" />
            {t("Open logs in Grafana")}
          </a>
        </Button>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {t("Grafana access is required. Logs may expire before this replay.")}
      </p>
    </div>
  );
}
