"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { Download, Loader2, X } from "lucide-react";
import { useExtracted } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  useCancelReplayExport,
  useCreateReplayExport,
  useDownloadReplayExport,
  useReplayExportStatus,
} from "@/api/analytics/hooks/sessionReplay/useReplayExport";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { downloadBlob } from "@/lib/export";

import { formatTime } from "../player/utils/replayUtils";
import { useReplayStore } from "../replayStore";

const MAX_EXPORT_DURATION_MS = 5 * 60 * 1000;

interface ReplayExportDialogProps {
  currentTime: number;
  duration: number;
  open: boolean;
  sessionId: string;
  onOpenChange: (open: boolean) => void;
}

export function ReplayExportDialog({ currentTime, duration, open, sessionId, onOpenChange }: ReplayExportDialogProps) {
  const t = useExtracted();
  const params = useParams();
  const siteId = Number(params.site);
  const [range, setRange] = useState<[number, number]>([0, Math.min(duration, 30_000)]);
  const [captureMs, setCaptureMs] = useState(0);
  const [skipInactivity, setSkipInactivity] = useState(true);
  const [includeNetwork, setIncludeNetwork] = useState(true);
  const [includeBodies, setIncludeBodies] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);
  const [exportId, setExportId] = useState<string | null>(null);
  const setExportRange = useReplayStore(state => state.setExportRange);
  const downloadedExportIdRef = useRef<string | null>(null);
  const createExport = useCreateReplayExport();
  const downloadExport = useDownloadReplayExport();
  const cancelExport = useCancelReplayExport();
  const { data: exportStatus } = useReplayExportStatus(siteId, sessionId, exportId);
  const rangeDuration = range[1] - range[0];
  const isRangeValid = rangeDuration > 0 && rangeDuration <= MAX_EXPORT_DURATION_MS;
  const isExporting = Boolean(
    exportId && exportStatus && !["ready", "failed", "cancelled"].includes(exportStatus.state)
  );

  useEffect(() => {
    if (!open || duration <= 0) return;
    const start = Math.max(0, currentTime - 15_000);
    const end = Math.min(duration, Math.max(start + 1_000, currentTime + 15_000));
    setRange([start, end]);
    setExportRange([start, end]);
    setCaptureMs(Math.max(start, Math.min(end, currentTime)));
    setExportId(null);
    downloadedExportIdRef.current = null;
  }, [currentTime, duration, open, setExportRange]);

  useEffect(() => {
    if (open) {
      setExportRange(range);
    }
  }, [open, range, setExportRange]);

  useEffect(() => {
    if (!exportId || exportStatus?.state !== "ready" || downloadedExportIdRef.current === exportId) return;
    downloadedExportIdRef.current = exportId;
    downloadExport
      .mutateAsync({ siteId, sessionId, exportId })
      .then(blob => {
        downloadBlob(exportStatus.filename ?? `rybbit-replay-${sessionId}.zip`, blob);
        toast.success(t("Replay export downloaded"));
      })
      .catch(error => {
        downloadedExportIdRef.current = null;
        toast.error(error instanceof Error ? error.message : t("Replay export download failed"));
      });
  }, [downloadExport, exportId, exportStatus, sessionId, siteId, t]);

  const statusLabel = useMemo(() => {
    switch (exportStatus?.state) {
      case "queued":
        return t("Waiting for export worker...");
      case "rendering":
        return t("Rendering replay video...");
      case "packaging":
        return t("Preparing logs and ZIP...");
      case "ready":
        return t("Export ready");
      case "failed":
        return exportStatus.error || t("Replay export failed");
      case "cancelled":
        return t("Replay export cancelled");
      default:
        return "";
    }
  }, [exportStatus, t]);

  const handleCreate = async () => {
    try {
      const result = await createExport.mutateAsync({
        siteId,
        sessionId,
        options: {
          startMs: range[0],
          endMs: range[1],
          captureMs,
          skipInactivity,
          includeNetwork,
          includeBodies: includeNetwork && includeBodies,
          playbackSpeed,
        },
      });
      setExportId(result.exportId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not start replay export"));
    }
  };

  const handleCancel = async () => {
    if (!exportId) return;
    await cancelExport.mutateAsync({ siteId, sessionId, exportId }).catch(() => undefined);
    setExportId(null);
  };

  const setQuickRange = (start: number, end: number) => {
    const nextRange: [number, number] = [Math.max(0, start), Math.min(duration, end)];
    setRange(nextRange);
    setCaptureMs(Math.max(nextRange[0], Math.min(nextRange[1], currentTime)));
  };

  const handleOpenChange = (value: boolean) => {
    if (isExporting) return;
    if (!value) setExportRange(null);
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Export replay range")}</DialogTitle>
          <DialogDescription>
            {t("Generate a WebM replay, evidence screenshot, HAR and CSV network logs.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setQuickRange(currentTime - 15_000, currentTime + 15_000)}
            >
              {t("Current ±15 s")}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setQuickRange(currentTime, currentTime + 30_000)}
            >
              {t("From current time")}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setQuickRange(0, Math.min(duration, MAX_EXPORT_DURATION_MS))}
            >
              {duration <= MAX_EXPORT_DURATION_MS ? t("Full replay") : t("First 5 minutes")}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
              <span>{formatTime(range[0])}</span>
              <span>{t("Range: {duration}", { duration: formatTime(rangeDuration) })}</span>
              <span>{formatTime(range[1])}</span>
            </div>
            <SliderPrimitive.Root
              min={0}
              max={Math.max(1, duration)}
              step={100}
              value={range}
              minStepsBetweenThumbs={10}
              onValueChange={value => {
                const nextRange: [number, number] = [value[0], value[1]];
                setRange(nextRange);
                setCaptureMs(current => Math.max(nextRange[0], Math.min(nextRange[1], current)));
              }}
              className="relative flex h-5 w-full touch-none select-none items-center"
            >
              <SliderPrimitive.Track className="relative h-2 w-full grow rounded-full bg-neutral-200 dark:bg-neutral-800">
                <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent-500" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-accent-500 bg-white shadow" />
              <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-accent-500 bg-white shadow" />
            </SliderPrimitive.Root>
            {!isRangeValid && (
              <p className="text-xs text-red-500">{t("The export range must be between 1 second and 5 minutes.")}</p>
            )}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <ReplayTimeInput
                label={t("Start time")}
                value={range[0]}
                onChange={value => setRange([Math.max(0, Math.min(value, range[1] - 1_000)), range[1]])}
              />
              <ReplayTimeInput
                label={t("End time")}
                value={range[1]}
                onChange={value => setRange([range[0], Math.min(duration, Math.max(value, range[0] + 1_000))])}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-neutral-600 dark:text-neutral-300">
              <span>{t("Evidence screenshot time")}</span>
              <span className="tabular-nums">{formatTime(captureMs)}</span>
            </div>
            <SliderPrimitive.Root
              min={range[0]}
              max={Math.max(range[0] + 1, range[1])}
              step={100}
              value={[captureMs]}
              onValueChange={value => setCaptureMs(value[0])}
              className="relative flex h-5 w-full touch-none select-none items-center"
            >
              <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-neutral-200 dark:bg-neutral-800">
                <SliderPrimitive.Range className="absolute h-full rounded-full bg-amber-500" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-amber-500 bg-white shadow" />
            </SliderPrimitive.Root>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ExportCheckbox
              checked={skipInactivity}
              onCheckedChange={setSkipInactivity}
              label={t("Skip inactivity in video")}
            />
            <ExportCheckbox
              checked={includeNetwork}
              onCheckedChange={setIncludeNetwork}
              label={t("Include network logs")}
            />
            <ExportCheckbox
              checked={includeBodies}
              disabled={!includeNetwork}
              onCheckedChange={setIncludeBodies}
              label={t("Include request and response bodies")}
            />
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t("Video speed")}</span>
              <select
                value={playbackSpeed}
                onChange={event => setPlaybackSpeed(Number(event.target.value) as 1 | 2 | 4)}
                className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900"
              >
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </label>
          </div>

          {exportId && (
            <div className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{statusLabel}</span>
                <span className="tabular-nums">{Math.round(exportStatus?.progress ?? 0)}%</span>
              </div>
              <Progress value={exportStatus?.progress ?? 0} />
            </div>
          )}
        </div>

        <DialogFooter>
          {isExporting ? (
            <Button type="button" variant="outline" onClick={handleCancel} disabled={cancelExport.isPending}>
              <X />
              {t("Cancel export")}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t("Close")}
            </Button>
          )}
          <Button
            type="button"
            onClick={handleCreate}
            disabled={!isRangeValid || createExport.isPending || isExporting}
          >
            {createExport.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            {t("Generate export")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplayTimeInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  const [draft, setDraft] = useState(() => formatEditableTime(value));

  useEffect(() => {
    setDraft(formatEditableTime(value));
  }, [value]);

  const commit = () => {
    const parsed = parseEditableTime(draft);
    if (parsed === null) {
      setDraft(formatEditableTime(value));
      return;
    }
    onChange(parsed);
  };

  return (
    <label className="space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
      <span>{label}</span>
      <Input
        value={draft}
        inputSize="sm"
        inputMode="decimal"
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => event.key === "Enter" && commit()}
      />
    </label>
  );
}

function formatEditableTime(milliseconds: number) {
  const totalSeconds = Math.max(0, milliseconds) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${(totalSeconds % 60).toFixed(1).padStart(4, "0")}`;
}

function parseEditableTime(value: string) {
  const match = value.trim().match(/^(\d+):([0-5]?\d(?:\.\d{1,3})?)$/);
  if (!match) return null;
  return (Number(match[1]) * 60 + Number(match[2])) * 1000;
}

function ExportCheckbox({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={value => onCheckedChange(value === true)} />
      <span>{label}</span>
    </label>
  );
}
