"use client";
import { Activity, AlertCircle, Plug2, Globe } from "lucide-react";
import { useExtracted } from "next-intl";
import { usePathname } from "next/navigation";
import { Sidebar } from "../../../../../components/sidebar/Sidebar";

export function UptimeSidebar() {
  const t = useExtracted();
  const pathname = usePathname();

  return (
    <Sidebar.Root>
      <Sidebar.Title>{t("Uptime")}</Sidebar.Title>
      <Sidebar.Items>
        <Sidebar.Item
          label={t("Monitors")}
          active={pathname.startsWith("/uptime/monitors")}
          href={"/uptime/monitors"}
          icon={<Activity className="w-4 h-4" />}
        />
        <Sidebar.Item
          label={t("Incidents")}
          active={pathname.startsWith("/uptime/incidents")}
          href={"/uptime/incidents"}
          icon={<AlertCircle className="w-4 h-4" />}
        />
        <Sidebar.Item
          label={t("Notifications")}
          active={pathname.startsWith("/uptime/notifications")}
          href={"/uptime/notifications"}
          icon={<Plug2 className="w-4 h-4" />}
        />
        <Sidebar.Item
          label={t("Status Page")}
          active={pathname.startsWith("/uptime/status-page")}
          href={"/uptime/status-page"}
          icon={<Globe className="w-4 h-4" />}
        />
      </Sidebar.Items>
    </Sidebar.Root>
  );
}
