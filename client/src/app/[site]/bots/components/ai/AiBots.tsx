"use client";
import { useExtracted } from "next-intl";

import { BotSectionTabs, type BotSectionTab } from "../BotSectionTabs";
import { formatBotPurpose } from "./aiLabels";

type Tab = "bots" | "purposes" | "operators";

/** Who is reading the site, at three levels of resolution. */
export function AiBots() {
  const t = useExtracted();
  const tabs: BotSectionTab<Tab>[] = [
    {
      value: "bots",
      label: t("Bots"),
      section: {
        dimension: "bot_name",
        title: t("AI bots"),
        purpose: "ai",
        getValue: item => item.value,
        getKey: item => item.value || "unnamed",
        // A bot whose user agent matched only a generic pattern has no
        // published name. Empty rows also come from before identity shipped.
        getLabel: item => item.value || t("Unnamed"),
        filterable: false,
      },
    },
    {
      value: "purposes",
      label: t("Purpose"),
      section: {
        dimension: "bot_purpose",
        title: t("What they came for"),
        purpose: "ai",
        getValue: item => item.value,
        getKey: item => item.value || "unclassified",
        getLabel: item => formatBotPurpose(item.value, t),
        filterable: false,
      },
    },
    {
      value: "operators",
      label: t("Operators"),
      section: {
        dimension: "bot_operator",
        title: t("AI operators"),
        purpose: "ai",
        getValue: item => item.value,
        getKey: item => item.value || "unknown",
        getLabel: item => item.value || t("Unknown"),
        filterable: false,
      },
    },
  ];

  return <BotSectionTabs defaultValue="bots" tabs={tabs} />;
}
