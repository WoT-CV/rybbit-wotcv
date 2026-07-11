"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { NetworkWaterfall } from "@/components/replay/network/NetworkWaterfall";
import type { ParsedNetworkRequest } from "@/components/replay/network/types";
import { getReplayActivityOffsets, type ReplaySegment } from "@/components/replay/player/utils/replayUtils";
import { getMeaningfulEvents, type MeaningfulEvent, type MeaningfulKind } from "@/components/replay/replayEvents";
import { cn } from "@/lib/utils";

interface ActivityPeriod {
  start: number;
  end: number;
}

interface ActivitySliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  activityPeriods?: ActivityPeriod[];
  replaySegments?: ReplaySegment[];
  duration?: number;
  events?: Array<{ timestamp: number; type: string | number; data?: any }>;
  networkRequests?: ParsedNetworkRequest[];
  currentTime?: number;
  onNetworkSeek?: (offset: number) => void;
  exportRange?: [number, number] | null;
}

const MARKER_COLOR: Record<MeaningfulKind, string> = {
  "session-start": "bg-emerald-500",
  navigation: "bg-blue-400",
  click: "bg-violet-500",
  dblclick: "bg-violet-500",
  rightclick: "bg-fuchsia-500",
  rageclick: "bg-red-500",
  input: "bg-amber-500",
  resize: "bg-cyan-500",
  console: "bg-blue-400",
};

const MAX_MARKERS = 160;
const ACTIVITY_BUCKETS = 160;

function markerColor(e: MeaningfulEvent): string {
  if (e.kind === "console") {
    return e.severity === "error" ? "bg-red-500" : e.severity === "warn" ? "bg-yellow-500" : "bg-blue-400";
  }
  return MARKER_COLOR[e.kind];
}

function shortLabel(e: MeaningfulEvent): string {
  switch (e.kind) {
    case "navigation":
      return "Navigation";
    case "rageclick":
      return `Rage click (×${e.count})`;
    case "console":
      return e.severity === "error" ? "Console error" : e.severity === "warn" ? "Console warning" : "Console log";
    case "click":
      return "Click";
    case "dblclick":
      return "Double click";
    case "rightclick":
      return "Right click";
    case "input":
      return "Typing";
    case "resize":
      return "Resize";
    default:
      return "Event";
  }
}

function formatOffset(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

const ActivitySlider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, ActivitySliderProps>(
  (
    {
      className,
      activityPeriods = [],
      replaySegments = [],
      duration = 100,
      events = [],
      networkRequests = [],
      currentTime = 0,
      onNetworkSeek = () => undefined,
      exportRange,
      ...props
    },
    ref
  ) => {
    const markers = React.useMemo(() => {
      const meaningful = getMeaningfulEvents(events).filter(e => e.kind !== "session-start" && e.offset > 0);
      if (meaningful.length <= MAX_MARKERS) return meaningful;
      // Keep every notable event; sample the rest so the rail stays legible.
      const notable = meaningful.filter(e => e.kind === "rageclick" || e.kind === "console" || e.kind === "navigation");
      const rest = meaningful.filter(e => !(e.kind === "rageclick" || e.kind === "console" || e.kind === "navigation"));
      const stride = Math.ceil(rest.length / Math.max(1, MAX_MARKERS - notable.length));
      const sampled = rest.filter((_, i) => i % stride === 0);
      return [...notable, ...sampled].sort((a, b) => a.offset - b.offset);
    }, [events]);
    const activityDensity = React.useMemo(() => {
      const buckets = Array.from({ length: ACTIVITY_BUCKETS }, () => 0);
      for (const offset of getReplayActivityOffsets(events, duration)) {
        const index = Math.min(ACTIVITY_BUCKETS - 1, Math.floor((offset / Math.max(1, duration)) * ACTIVITY_BUCKETS));
        buckets[index] += 1;
      }
      const maximum = Math.max(1, ...buckets);
      return buckets.map(count => count / maximum);
    }, [duration, events]);

    return (
      <div className="w-full">
        {/* Event markers */}
        <div className="relative h-6 w-full mb-2">
          <div className="pointer-events-none absolute inset-0 flex items-end gap-px overflow-hidden">
            {activityDensity.map((density, index) => (
              <div
                key={index}
                className="min-w-0 flex-1 rounded-t-sm bg-neutral-400/65 dark:bg-neutral-500/70"
                style={{ height: density === 0 ? 0 : `${Math.max(12, density * 100)}%` }}
              />
            ))}
          </div>
          <NetworkWaterfall
            requests={networkRequests}
            duration={duration}
            currentTime={currentTime}
            onSeek={onNetworkSeek}
          />
          {markers.map(event => {
            const position = duration > 0 ? (event.offset / duration) * 100 : 0;
            const constrained = Math.max(0.5, Math.min(99.5, position));
            return (
              <div
                key={event.key}
                className={cn(
                  "absolute h-2 w-2 rounded-full ring-2 ring-white dark:ring-neutral-900",
                  markerColor(event)
                )}
                style={{ left: `${constrained}%`, top: "72%", transform: "translate(-50%, -50%)" }}
                title={`${shortLabel(event)} · ${formatOffset(event.offset)}`}
              />
            );
          })}
        </div>

        {/* Activity Slider */}
        <SliderPrimitive.Root
          ref={ref}
          className={cn("relative flex w-full touch-none select-none items-center", className)}
          {...props}
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            {/* Inactive background */}
            <div className="absolute h-full w-full bg-neutral-300 dark:bg-neutral-700" />

            {/* Activity periods */}
            {(replaySegments.length > 0 ? replaySegments : activityPeriods).map((period, index) => {
              const startPercent = duration > 0 ? (period.start / duration) * 100 : 0;
              const widthPercent = duration > 0 ? ((period.end - period.start) / duration) * 100 : 0;
              const isActive = "isActive" in period ? period.isActive : true;
              return (
                <div
                  key={index}
                  className={cn(
                    "absolute h-full",
                    isActive ? "bg-neutral-400 dark:bg-neutral-500" : "bg-neutral-300/40 dark:bg-neutral-800"
                  )}
                  style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                />
              );
            })}

            {/* Progress range */}
            <SliderPrimitive.Range className="absolute h-full bg-accent-500" />

            {exportRange && duration > 0 && (
              <div
                className="pointer-events-none absolute inset-y-0 rounded-sm border border-accent-400 bg-accent-400/20"
                style={{
                  left: `${(exportRange[0] / duration) * 100}%`,
                  width: `${((exportRange[1] - exportRange[0]) / duration) * 100}%`,
                }}
              />
            )}
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-accent-500 bg-white shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-500 disabled:pointer-events-none disabled:opacity-50" />
        </SliderPrimitive.Root>
      </div>
    );
  }
);
ActivitySlider.displayName = "ActivitySlider";

export { ActivitySlider };
