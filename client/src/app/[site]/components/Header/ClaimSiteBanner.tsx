"use client";

import { Clock } from "lucide-react";
import { useExtracted } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useGetSite } from "../../../../api/admin/hooks/useSites";
import { Button } from "../../../../components/ui/button";
import { useStore } from "../../../../lib/store";
import { useConfigs } from "../../../../lib/configs";
import { userStore } from "../../../../lib/userStore";
import { ClaimSiteDialog } from "./ClaimSiteDialog";

function formatRemaining(ms: number) {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Shown on every page of an unclaimed site's dashboard, for as long as it is
 * unclaimed. It never collapses or hides: the deadline is real.
 */
export function ClaimSiteBanner() {
  const { configs } = useConfigs();
  const { site } = useStore();
  return configs?.capabilities?.unclaimedSites ? <EnabledClaimSiteBanner key={site} /> : null;
}

function EnabledClaimSiteBanner() {
  const t = useExtracted();
  const { site, privateKey } = useStore();
  const { user } = userStore();
  const { data: siteMetadata } = useGetSite(site);
  const searchParams = useSearchParams();

  // OAuth signup returns here with ?claim=1 so the dialog reopens at the claim step.
  const [open, setOpen] = useState(false);
  const [resumedRequest, setResumedRequest] = useState<string | null>(null);
  const [claimTarget, setClaimTarget] = useState<{
    siteId: number;
    domain: string;
    privateLinkKey: string;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isUnclaimed = !!siteMetadata && siteMetadata.organizationId === null && !!siteMetadata.claimExpiresAt;

  useEffect(() => {
    if (!isUnclaimed) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isUnclaimed]);

  const resumePlan = !!user && siteMetadata?.isOwner && searchParams.get("claim") === "plan";
  const target =
    claimTarget ??
    (siteMetadata && (isUnclaimed || resumePlan)
      ? {
          siteId: siteMetadata.siteId,
          domain: siteMetadata.domain,
          privateLinkKey: privateKey ?? "",
        }
      : null);

  const changeOpen = (next: boolean) => {
    if (next && target) setClaimTarget(target);
    setOpen(next);
  };

  const resumeRequest =
    (isUnclaimed && user && searchParams.get("claim") === "1") || resumePlan ? searchParams.get("claim") : null;
  // Capture each URL resume once, before rendering children. The target must
  // survive revocation of the private link while checkout is still mounted;
  // closing the dialog must not immediately reopen it on a metadata refetch.
  if (resumeRequest && resumeRequest !== resumedRequest && siteMetadata) {
    setResumedRequest(resumeRequest);
    setClaimTarget({
      siteId: siteMetadata.siteId,
      domain: siteMetadata.domain,
      privateLinkKey: privateKey ?? "",
    });
    setOpen(true);
  }

  const remainingMs = siteMetadata?.claimExpiresAt ? new Date(siteMetadata.claimExpiresAt).getTime() - now : 0;
  const expired = remainingMs <= 0;

  return (
    <>
      {isUnclaimed && siteMetadata && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm dark:border-yellow-400/30 dark:bg-yellow-400/10"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-yellow-700 dark:text-yellow-300" aria-hidden="true" />
            <span className="text-neutral-800 dark:text-neutral-100">
              {expired
                ? t("{domain} has expired and will be deleted shortly.", { domain: siteMetadata.domain })
                : t("{domain} isn't claimed. It will be deleted in {remaining} unless you claim it.", {
                    domain: siteMetadata.domain,
                    remaining: formatRemaining(remainingMs),
                  })}
            </span>
          </div>
          <Button
            variant="success"
            size="sm"
            className="ml-auto"
            onClick={() => changeOpen(true)}
            disabled={expired || !privateKey}
          >
            {t("Claim this site")}
          </Button>
        </div>
      )}
      {target && (
        <ClaimSiteDialog
          key={target.siteId}
          open={open}
          onOpenChange={changeOpen}
          {...target}
          organizationId={resumePlan ? (siteMetadata?.organizationId ?? undefined) : undefined}
        />
      )}
    </>
  );
}
