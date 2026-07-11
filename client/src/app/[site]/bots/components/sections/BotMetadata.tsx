"use client";

import { useExtracted } from "next-intl";
import { truncateString } from "../../../../../lib/utils";
import { BotSectionTabs, type BotSectionTab } from "../BotSectionTabs";

type Tab = "asn_orgs" | "bot_categories" | "ua_patterns";

function formatBotCategory(value: string, uncategorizedLabel: string) {
  if (!value) return uncategorizedLabel;
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function BotMetadata() {
  const t = useExtracted();

  const tabs: BotSectionTab<Tab>[] = [
    {
      value: "asn_orgs",
      label: t("ASN Orgs"),
      section: {
        dimension: "asn_org",
        title: t("ASN Orgs"),
        getValue: item => item.value,
        getKey: item => item.value || "unknown",
        getLabel: item => item.value || t("Unknown"),
        filterable: false,
      },
    },
    {
      value: "bot_categories",
      label: t("Categories"),
      section: {
        dimension: "bot_category",
        title: t("Bot Categories"),
        getValue: item => item.value,
        getKey: item => item.value || "uncategorized",
        getLabel: item => formatBotCategory(item.value, t("Uncategorized")),
        filterable: false,
      },
    },
    {
      value: "ua_patterns",
      label: t("UA Patterns"),
      section: {
        dimension: "matched_ua_pattern",
        title: t("Matched UA Patterns"),
        getValue: item => item.value,
        getKey: item => item.value || "none",
        getLabel: item => truncateString(item.value, 70) || t("No matched pattern"),
        filterable: false,
      },
    },
  ];

  return <BotSectionTabs defaultValue="asn_orgs" tabs={tabs} />;
}
