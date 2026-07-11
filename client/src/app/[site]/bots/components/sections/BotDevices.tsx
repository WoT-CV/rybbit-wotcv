"use client";

import { useExtracted } from "next-intl";
import { Browser } from "../../../components/shared/icons/Browser";
import { DeviceIcon } from "../../../components/shared/icons/Device";
import { OperatingSystem } from "../../../components/shared/icons/OperatingSystem";
import { BotSectionTabs, type BotSectionTab } from "../BotSectionTabs";

type Tab = "browsers" | "browser_versions" | "devices" | "os" | "os_versions" | "dimensions";

export function BotDevices() {
  const t = useExtracted();
  const otherLabel = t("Other");

  const tabs: BotSectionTab<Tab>[] = [
    {
      value: "browsers",
      label: t("Browsers"),
      section: {
        dimension: "browser",
        title: t("Browsers"),
        getValue: item => item.value,
        getKey: item => item.value || "other",
        getLabel: item => (
          <div className="flex gap-2 items-center">
            <Browser browser={item.value || "Other"} />
            {item.value || otherLabel}
          </div>
        ),
      },
    },
    {
      value: "browser_versions",
      label: t("Versions"),
      section: {
        dimension: "browser_version",
        title: t("Browser Versions"),
        getValue: item => item.value,
        getKey: item => item.value || "other",
        getLabel: item => {
          const browser = item.value.split(" ").slice(0, -1).join(" ");
          return (
            <div className="flex gap-2 items-center">
              <Browser browser={browser || "Other"} />
              {item.value || otherLabel}
            </div>
          );
        },
      },
    },
    {
      value: "devices",
      label: t("Devices"),
      section: {
        dimension: "device_type",
        title: t("Devices"),
        getValue: item => item.value,
        getKey: item => item.value || "other",
        getLabel: item => (
          <div className="flex gap-2 items-center">
            <DeviceIcon deviceType={item.value || ""} size={16} />
            {item.value || otherLabel}
          </div>
        ),
      },
    },
    {
      value: "os",
      label: "OS",
      section: {
        dimension: "operating_system",
        title: t("Operating Systems"),
        getValue: item => item.value,
        getKey: item => item.value || "other",
        getLabel: item => (
          <div className="flex gap-2 items-center">
            <OperatingSystem os={item.value || "Other"} />
            {item.value || otherLabel}
          </div>
        ),
      },
    },
    {
      value: "os_versions",
      label: t("OS Versions"),
      section: {
        dimension: "operating_system_version",
        title: t("OS Versions"),
        getValue: item => item.value,
        getKey: item => item.value || "other",
        getLabel: item => {
          const os = item.value.split(" ").slice(0, -1).join(" ");
          return (
            <div className="flex gap-2 items-center">
              <OperatingSystem os={os || "Other"} />
              {item.value || otherLabel}
            </div>
          );
        },
      },
    },
    {
      value: "dimensions",
      label: t("Dimensions"),
      section: {
        dimension: "dimensions",
        title: t("Screen Dimensions"),
        getValue: item => item.value,
        getKey: item => item.value || "other",
        getLabel: item => item.value || otherLabel,
      },
    },
  ];

  return <BotSectionTabs defaultValue="browsers" tabs={tabs} />;
}
