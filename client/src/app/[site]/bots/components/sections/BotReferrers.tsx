"use client";

import { useExtracted } from "next-intl";
import { Favicon } from "../../../../../components/Favicon";
import { BotSectionTabs, type BotSectionTab } from "../BotSectionTabs";

type Tab = "referrers";

export function BotReferrers() {
  const t = useExtracted();

  const tabs: BotSectionTab<Tab>[] = [
    {
      value: "referrers",
      label: t("Referrers"),
      section: {
        dimension: "referrer",
        title: t("Referrers"),
        getValue: item => item.value,
        getKey: item => item.value || "direct",
        getLink: item => (item.value ? `https://${item.value}` : undefined),
        getLabel: item => (
          <div className="flex items-center">
            {item.value && <Favicon domain={item.value} className="w-4 mr-2" />}
            {item.value || t("Direct")}
          </div>
        ),
      },
    },
  ];

  return <BotSectionTabs defaultValue="referrers" tabs={tabs} />;
}
