"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { useExtracted } from "next-intl";

import { formatTime } from "../player/utils/replayUtils";

const MAX_EXPORT_DURATION_MS = 2 * 60_000;

interface ReplayExportRangeSliderProps {
  duration: number;
  range: [number, number];
  onRangeChange: (range: [number, number]) => void;
}

export function ReplayExportRangeSlider({ duration, range, onRangeChange }: ReplayExportRangeSliderProps) {
  const t = useExtracted();
  const rangeDuration = range[1] - range[0];

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center justify-between gap-3 text-[10px] leading-none text-neutral-500 dark:text-neutral-400">
        <span className="font-medium">{t("Export range")}</span>
        <span className="tabular-nums">
          {formatTime(range[0])}–{formatTime(range[1])} · {formatTime(rangeDuration)}
        </span>
      </div>
      <SliderPrimitive.Root
        min={0}
        max={Math.max(1, duration)}
        step={100}
        minStepsBetweenThumbs={10}
        value={range}
        onValueChange={value => onRangeChange(constrainExportRange([value[0], value[1]], range, duration))}
        className="relative flex h-4 w-full touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-visible rounded-full bg-neutral-300 dark:bg-neutral-700">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-px">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className="h-2 w-px bg-neutral-500/60 dark:bg-neutral-400/50" />
            ))}
          </div>
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent-500" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={t("Start time")}
          className="block h-3.5 w-3.5 rounded-full border-2 border-accent-500 bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-500"
        />
        <SliderPrimitive.Thumb
          aria-label={t("End time")}
          className="block h-3.5 w-3.5 rounded-full border-2 border-accent-500 bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-500"
        />
      </SliderPrimitive.Root>
      <div className="flex justify-between text-[9px] leading-none tabular-nums text-neutral-500 dark:text-neutral-500">
        <span>{formatTime(0)}</span>
        <span>{formatTime(duration / 2)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

export function createInitialExportRange(currentTime: number, duration: number): [number, number] {
  const rangeDuration = Math.min(MAX_EXPORT_DURATION_MS, duration);
  const start = clamp(currentTime - rangeDuration / 2, 0, Math.max(0, duration - rangeDuration));
  return [start, start + rangeDuration];
}

function constrainExportRange(
  nextRange: [number, number],
  currentRange: [number, number],
  duration: number
): [number, number] {
  const start = clamp(nextRange[0], 0, duration);
  const end = clamp(nextRange[1], start, duration);
  if (end - start <= MAX_EXPORT_DURATION_MS) return [start, end];

  const startMovedMore = Math.abs(start - currentRange[0]) > Math.abs(end - currentRange[1]);
  return startMovedMore
    ? [start, Math.min(duration, start + MAX_EXPORT_DURATION_MS)]
    : [Math.max(0, end - MAX_EXPORT_DURATION_MS), end];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
