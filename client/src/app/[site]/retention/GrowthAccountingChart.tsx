"use client";

import { ResponsiveBar } from "@nivo/bar";
import { Info } from "lucide-react";
import { DateTime } from "luxon";
import { useExtracted, useLocale } from "next-intl";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { GrowthAccountingPoint, RetentionMode } from "@/api/analytics/endpoints";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { ErrorState } from "@/components/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNivoTheme } from "@/lib/nivo";
import { cn } from "@/lib/utils";

import { getGrowthTooltipValues, type GrowthTooltipValues } from "./growthAccountingChartUtils";

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
  period: string;
  values: GrowthTooltipValues;
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
  const descriptions: Record<GrowthSeriesKey, string> = {
    newUsers: t("Users active in this period for the first time."),
    returningUsers: t("Users active in both this period and the immediately preceding period."),
    resurrectingUsers: t("Users active again after at least one inactive period."),
    dormantUsers: t("Users active in the preceding period but inactive in this period."),
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
  const tooltipHeight = 148;
  const tooltipLeft = tooltip ? Math.max(8, Math.min(tooltip.x + 12, window.innerWidth - tooltipWidth - 8)) : 0;
  const tooltipTop = tooltip ? Math.max(8, Math.min(tooltip.y + 12, window.innerHeight - tooltipHeight - 8)) : 0;

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
          <Tooltip key={series.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="-mx-1 inline-flex items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800"
              >
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series.color }} />
                <span>{labels[series.key]}</span>
                <Info className="h-3 w-3 text-neutral-400" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-72">
              <div className="mb-1 font-medium">{labels[series.key]}</div>
              <div className="leading-relaxed text-neutral-600 dark:text-neutral-300">{descriptions[series.key]}</div>
            </TooltipContent>
          </Tooltip>
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
            const period = String(datum.indexValue);
            const point = chartData.find(chartPoint => chartPoint.period === period);

            if (!point) {
              setTooltip(null);
              return;
            }

            setTooltip({
              period,
              values: getGrowthTooltipValues(point),
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
              <div className="space-y-1">
                {SERIES.map(series => (
                  <div key={series.key} className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2 text-neutral-600 dark:text-neutral-300">
                      <span className="h-3 w-1 shrink-0 rounded-sm" style={{ backgroundColor: series.color }} />
                      <span className="truncate">{labels[series.key]}</span>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums text-neutral-700 dark:text-neutral-200">
                      {tooltip.values[series.key].toLocaleString(locale)}
                    </span>
                  </div>
                ))}
              </div>
            </ChartTooltip>
          </div>,
          document.body
        )}
    </div>
  );
}
