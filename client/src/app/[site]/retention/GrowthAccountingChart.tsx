"use client";

import { ResponsiveBar } from "@nivo/bar";
import { DateTime } from "luxon";
import { useExtracted, useLocale } from "next-intl";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { GrowthAccountingPoint, RetentionMode } from "@/api/analytics/endpoints";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { ErrorState } from "@/components/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { useNivoTheme } from "@/lib/nivo";
import { cn } from "@/lib/utils";

interface GrowthAccountingChartProps {
  data: GrowthAccountingPoint[] | undefined;
  isError: boolean;
  isLoading: boolean;
  mode: RetentionMode;
  className?: string;
}

const SERIES = [
  { key: "newUsers", color: "hsl(var(--blue-500))" },
  { key: "returningUsers", color: "hsl(var(--emerald-600))" },
  { key: "resurrectingUsers", color: "hsl(var(--purple-500))" },
  { key: "dormantUsers", color: "hsl(var(--orange-600))" },
] as const;

type GrowthSeriesKey = (typeof SERIES)[number]["key"];

interface GrowthTooltipState {
  color: string;
  period: string;
  seriesKey: GrowthSeriesKey;
  value: number;
  x: number;
  y: number;
}

export function GrowthAccountingChart({ data, isError, isLoading, mode, className }: GrowthAccountingChartProps) {
  const t = useExtracted();
  const locale = useLocale();
  const nivoTheme = useNivoTheme();
  const [tooltip, setTooltip] = useState<GrowthTooltipState | null>(null);
  const labels: Record<GrowthSeriesKey, string> = {
    newUsers: t("New users"),
    returningUsers: t("Returning users"),
    resurrectingUsers: t("Resurrected users"),
    dormantUsers: t("Dormant users"),
  };

  const chartData = useMemo(
    () =>
      (data ?? []).map(point => ({
        period: point.period,
        newUsers: point.newUsers,
        returningUsers: point.returningUsers,
        resurrectingUsers: point.resurrectingUsers,
        dormantUsers: -point.dormantUsers,
      })),
    [data]
  );
  const tickStep = Math.max(1, Math.ceil(chartData.length / 8));

  const formatPeriod = (value: string) => {
    const period = DateTime.fromISO(value).setLocale(locale);
    return mode === "week" ? period.toFormat("d MMM") : period.toFormat("dd MMM");
  };

  if (isLoading) {
    return <Skeleton className={cn("h-full min-h-[240px] w-full", className)} />;
  }

  if (isError) {
    return (
      <div className={cn("flex h-full min-h-[240px] items-center justify-center", className)}>
        <ErrorState
          title={t("Failed to load growth accounting data")}
          message={t("There was a problem fetching growth accounting data. Please try again later.")}
        />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[240px] items-center justify-center text-sm text-neutral-500 dark:text-neutral-400",
          className
        )}
      >
        {t("No growth accounting data available")}
      </div>
    );
  }

  const tooltipWidth = 240;
  const tooltipLeft = tooltip ? Math.max(8, Math.min(tooltip.x + 12, window.innerWidth - tooltipWidth - 8)) : 0;
  const tooltipTop = tooltip ? Math.max(8, Math.min(tooltip.y + 12, window.innerHeight - 96)) : 0;

  return (
    <div
      className={cn("relative flex h-full min-h-0 flex-col gap-3", className)}
      onMouseMove={event =>
        setTooltip(current => (current ? { ...current, x: event.clientX, y: event.clientY } : current))
      }
      onMouseLeave={() => setTooltip(null)}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-600 dark:text-neutral-300">
        {SERIES.map(series => (
          <div key={series.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series.color }} />
            <span>{labels[series.key]}</span>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveBar
          data={chartData}
          keys={SERIES.map(series => series.key)}
          indexBy="period"
          groupMode="stacked"
          theme={nivoTheme}
          margin={{ top: 10, right: 20, bottom: 45, left: 55 }}
          padding={0.25}
          valueScale={{ type: "linear" }}
          indexScale={{ type: "band", round: true }}
          colors={({ id }) => SERIES.find(series => series.key === id)?.color ?? "hsl(var(--neutral-500))"}
          enableGridX={false}
          enableGridY={true}
          enableLabel={false}
          borderRadius={1}
          animate={false}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 5,
            tickPadding: 8,
            tickRotation: 0,
            format: value => {
              const index = chartData.findIndex(point => point.period === value);
              return index >= 0 && index % tickStep === 0 ? formatPeriod(String(value)) : "";
            },
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 8,
            tickRotation: 0,
            format: value => Math.abs(Number(value)).toLocaleString(locale),
          }}
          onMouseEnter={(datum, event) => {
            const seriesKey = String(datum.id) as GrowthSeriesKey;
            setTooltip({
              color: SERIES.find(series => series.key === seriesKey)?.color ?? "hsl(var(--neutral-500))",
              period: String(datum.indexValue),
              seriesKey,
              value: Math.abs(Number(datum.value)),
              x: event.clientX,
              y: event.clientY,
            });
          }}
          onMouseLeave={() => setTooltip(null)}
          tooltip={() => <></>}
          role="img"
          ariaLabel={t("Growth accounting chart")}
        />
      </div>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999]"
            style={{ left: tooltipLeft, top: tooltipTop, width: tooltipWidth }}
          >
            <ChartTooltip className="p-2">
              <div className="mb-2 font-medium text-neutral-700 dark:text-neutral-200">
                {formatPeriod(tooltip.period)}
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2 text-neutral-600 dark:text-neutral-300">
                  <span className="h-3 w-1 shrink-0 rounded-sm" style={{ backgroundColor: tooltip.color }} />
                  <span className="truncate">{labels[tooltip.seriesKey]}</span>
                </div>
                <span className="shrink-0 font-medium tabular-nums text-neutral-700 dark:text-neutral-200">
                  {tooltip.value.toLocaleString(locale)}
                </span>
              </div>
            </ChartTooltip>
          </div>,
          document.body
        )}
    </div>
  );
}
