"use client";
import { useExtracted } from "next-intl";

import { useGetSite } from "../../../../../api/admin/hooks/useSites";
import { truncateString } from "../../../../../lib/utils";
import { BotSectionTabs, type BotSectionTab } from "../BotSectionTabs";

type Tab = "pages" | "agent_pages";

/** What the AI systems actually read. */
export function AiPages() {
  const t = useExtracted();
  const { data: siteMetadata } = useGetSite();

  const linkFor = (host: string | undefined, path: string) => (host && path ? `https://${host}${path}` : undefined);

  const tabs: BotSectionTab<Tab>[] = [
    {
      value: "pages",
      label: t("All AI"),
      section: {
        dimension: "pathname",
        title: t("Pages read by AI"),
        purpose: "ai",
        getValue: item => item.value,
        getKey: item => item.value || "unknown",
        getLabel: item => truncateString(item.value, 50) || t("Other"),
        getLink: item => linkFor(item.hostname || siteMetadata?.domain, item.value),
      },
    },
    {
      value: "agent_pages",
      label: t("Agents only"),
      section: {
        dimension: "pathname",
        title: t("Pages agents opened"),
        // The pages a person's assistant was sent to are a different signal
        // from the pages a crawler swept: these track live intent.
        purpose: "ai_agent",
        getValue: item => item.value,
        getKey: item => item.value || "unknown",
        getLabel: item => truncateString(item.value, 50) || t("Other"),
        getLink: item => linkFor(item.hostname || siteMetadata?.domain, item.value),
      },
    },
  ];

  return <BotSectionTabs defaultValue="pages" tabs={tabs} />;
}
