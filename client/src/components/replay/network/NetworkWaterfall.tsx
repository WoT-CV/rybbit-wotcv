import { useExtracted } from "next-intl";

import { cn } from "@/lib/utils";

import {
  formatNetworkDuration,
  getNetworkStatusLabel,
  getRequestDisplayUrl,
  isNetworkRequestError,
} from "./networkEventUtils";
import type { ParsedNetworkRequest } from "./types";

interface NetworkWaterfallProps {
  requests: ParsedNetworkRequest[];
  duration: number;
  currentTime: number;
  onSeek: (offset: number) => void;
}

const MAX_WATERFALL_REQUESTS = 500;

export function NetworkWaterfall({ requests, duration, currentTime, onSeek }: NetworkWaterfallProps) {
  const t = useExtracted();
  if (duration <= 0 || requests.length === 0) return null;

  const visibleRequests = getVisibleRequests(requests, currentTime);

  return (
    <div className="absolute inset-x-0 top-0 h-2.5" role="group" aria-label={t("Network request waterfall")}>
      {visibleRequests.map((request, index) => {
        const left = clampPercent((request.startOffset / duration) * 100);
        const rawWidth = ((request.endOffset - request.startOffset) / duration) * 100;
        const width = Math.min(100 - left, Math.max(0.35, rawWidth));
        const isActive = currentTime >= request.startOffset && currentTime <= request.endOffset;
        const isError = isNetworkRequestError(request);

        return (
          <button
            key={request.requestId}
            type="button"
            className={cn(
              "absolute h-[2px] min-w-px rounded-full transition-[height,opacity] hover:h-1 focus-visible:z-20 focus-visible:h-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 dark:focus-visible:ring-neutral-300",
              isError ? "bg-red-500" : "bg-dataviz",
              isActive ? "z-10 h-1 bg-accent-500 opacity-100" : "opacity-75"
            )}
            style={{ left: `${left}%`, top: `${(index % 3) * 3}px`, width: `${width}%` }}
            onClick={() => onSeek(request.startOffset)}
            title={`${request.method} ${getRequestDisplayUrl(request)} · ${getNetworkStatusLabel(request)} · ${formatNetworkDuration(request.durationMs)}`}
            aria-label={`${request.method} ${getRequestDisplayUrl(request)}, ${formatNetworkDuration(request.durationMs)}`}
          />
        );
      })}
    </div>
  );
}

function getVisibleRequests(requests: ParsedNetworkRequest[], currentTime: number): ParsedNetworkRequest[] {
  if (requests.length <= MAX_WATERFALL_REQUESTS) return requests;

  const notable = requests.filter(
    request =>
      isNetworkRequestError(request) || (currentTime >= request.startOffset && currentTime <= request.endOffset)
  );
  const notableIds = new Set(notable.map(request => request.requestId));
  const regular = requests.filter(request => !notableIds.has(request.requestId));
  const availableSlots = Math.max(1, MAX_WATERFALL_REQUESTS - notable.length);
  const stride = Math.ceil(regular.length / availableSlots);
  return [...notable, ...regular.filter((_, index) => index % stride === 0)]
    .sort((first, second) => first.startedAt - second.startedAt)
    .slice(0, MAX_WATERFALL_REQUESTS);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
