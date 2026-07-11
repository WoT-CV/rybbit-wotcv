"use client";

import { Download, Loader2 } from "lucide-react";
import { useExtracted } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  useCreateReplayExport,
  useDownloadReplayExport,
  useReplayExportStatus,
} from "@/api/analytics/hooks/sessionReplay/useReplayExport";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { downloadBlob } from "@/lib/export";

interface ReplayExportButtonProps {
  disabled?: boolean;
  range: [number, number] | null;
  sessionId: string;
}

export function ReplayExportButton({ disabled, range, sessionId }: ReplayExportButtonProps) {
  const t = useExtracted();
  const params = useParams();
  const siteId = Number(params.site);
  const [exportId, setExportId] = useState<string | null>(null);
  const handledExportIdRef = useRef<string | null>(null);
  const createExport = useCreateReplayExport();
  const downloadExport = useDownloadReplayExport();
  const { data: exportStatus } = useReplayExportStatus(siteId, sessionId, exportId);
  const isExporting = Boolean(exportId && !["ready", "failed", "cancelled"].includes(exportStatus?.state ?? "queued"));

  useEffect(() => {
    if (!exportId || !exportStatus || handledExportIdRef.current === exportId) return;

    if (exportStatus.state === "ready") {
      handledExportIdRef.current = exportId;
      downloadExport
        .mutateAsync({ siteId, sessionId, exportId })
        .then(blob => {
          downloadBlob(exportStatus.filename ?? `rybbit-export-${sessionId}.zip`, blob);
          toast.success(t("Replay export downloaded"));
          setExportId(null);
        })
        .catch(error => {
          handledExportIdRef.current = null;
          toast.error(error instanceof Error ? error.message : t("Replay export download failed"));
          setExportId(null);
        });
      return;
    }

    if (exportStatus.state === "failed" || exportStatus.state === "cancelled") {
      handledExportIdRef.current = exportId;
      toast.error(exportStatus.error || t("Replay export failed"));
      queueMicrotask(() => setExportId(null));
    }
  }, [downloadExport, exportId, exportStatus, sessionId, siteId, t]);

  const handleExport = async () => {
    if (!range) return;
    handledExportIdRef.current = null;

    try {
      const result = await createExport.mutateAsync({
        siteId,
        sessionId,
        options: {
          startMs: range[0],
          endMs: range[1],
        },
      });
      setExportId(result.exportId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not start replay export"));
    }
  };

  const progress = Math.round(exportStatus?.progress ?? 0);
  const busy = createExport.isPending || Boolean(exportId) || downloadExport.isPending;

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      disabled={disabled || !range || busy}
      onClick={handleExport}
      aria-busy={busy}
      title={t("Export replay range")}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-3 w-3" aria-hidden="true" />
      )}
      <span className="hidden 2xl:inline">{isExporting ? `${t("Export")} ${progress}%` : t("Export")}</span>
    </Button>
  );
}
