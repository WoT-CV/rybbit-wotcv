"use client";

import { useExtracted } from "next-intl";
import { useGetSite } from "../../../../../api/admin/hooks/useSites";
import { truncateString } from "../../../../../lib/utils";
import { BotSectionTabs, type BotSectionTab } from "../BotSectionTabs";

type Tab = "pages" | "hostnames";

export function BotPages() {
  const t = useExtracted();
  const { data: siteMetadata } = useGetSite();

  const tabs: BotSectionTab<Tab>[] = [
    {
      value: "pages",
      label: t("Pages"),
      section: {
        dimension: "pathname",
        title: t("Pages"),
        getValue: item => item.value,
        getKey: item => item.value || "unknown",
        getLabel: item => truncateString(item.value, 50) || t("Other"),
        getLink: item => {
          const host = item.hostname || siteMetadata?.domain;
          return host && item.value ? `https://${host}${item.value}` : undefined;
        },
      },
    },
    {
      value: "hostnames",
      label: t("Hostnames"),
      section: {
        dimension: "hostname",
        title: t("Hostnames"),
        getValue: item => item.value,
        getKey: item => item.value || "unknown",
        getLabel: item => item.value || t("Other"),
      },
    },
  ];

  return <BotSectionTabs defaultValue="pages" tabs={tabs} />;
}
