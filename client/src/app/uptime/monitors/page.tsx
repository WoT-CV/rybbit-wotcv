"use client";

import { Button } from "@/components/ui/button";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Plus } from "lucide-react";
import { useExtracted } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MonitorDialog } from "./components/dialog";
import { MonitorsTable } from "./components/MonitorsTable";

export default function UptimePage() {
  const t = useExtracted();
  const router = useRouter();
  useSetPageTitle(t("Uptime Monitoring"));
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const handleMonitorClick = (monitor: any) => {
    router.push(`/uptime/monitors/${monitor.id}`);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t("Uptime Monitoring")}</h1>
          <p className="text-sm text-neutral-500 mt-1">{t("Monitor the availability and performance of your endpoints")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="flex items-center gap-2" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            {t("Add Monitor")}
          </Button>
        </div>
      </div>

      <MonitorsTable onMonitorClick={handleMonitorClick} />

      <MonitorDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </>
  );
}
