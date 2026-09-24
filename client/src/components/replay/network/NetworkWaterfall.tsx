import { useExtracted } from "next-intl";
import { memo } from "react";

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

  const activeRequests = requests.filter(
    request => currentTime >= request.startOffset && currentTime <= request.endOffset
  );

  return (
    <div className="absolute inset-x-0 top-0 h-2.5" role="group" aria-label={t("Network request waterfall")}>
      <NetworkWaterfallBars requests={requests} activeRequests={activeRequests} duration={duration} onSeek={onSeek} />
    </div>
  );
}

interface NetworkWaterfallBarsProps {
  requests: ParsedNetworkRequest[];
  activeRequests: ParsedNetworkRequest[];
  duration: number;
  onSeek: (offset: number) => void;
}

const NetworkWaterfallBars = memo(
  function NetworkWaterfallBars({ requests, activeRequests, duration, onSeek }: NetworkWaterfallBarsProps) {
    const active = new Set(activeRequests);
    return getVisibleRequests(requests, active).map((request, index) => (
      <NetworkRequestBar
        key={request.requestId}
        request={request}
        duration={duration}
        lane={index % 3}
        isActive={active.has(request)}
        onSeek={onSeek}
      />
    ));
  },
  // The filtered array is new each frame, but usually contains the same request
  // objects. Compare that small set instead of allocating up to 500 React
  // elements on every tick. Include all other props to keep seeks/resizes fresh.
  (previous, next) =>
    previous.requests === next.requests &&
    previous.duration === next.duration &&
    previous.onSeek === next.onSeek &&
    previous.activeRequests.length === next.activeRequests.length &&
    previous.activeRequests.every((request, index) => request === next.activeRequests[index])
);

// The replay clock advances every animation frame. Only bars whose active
// state changes need new labels, URL parsing, styles or click handlers.
const NetworkRequestBar = memo(function NetworkRequestBar({
  request,
  duration,
  lane,
  isActive,
  onSeek,
}: {
  request: ParsedNetworkRequest;
  duration: number;
  lane: number;
  isActive: boolean;
  onSeek: (offset: number) => void;
}) {
  const left = clampPercent((request.startOffset / duration) * 100);
  const rawWidth = ((request.endOffset - request.startOffset) / duration) * 100;
  const width = Math.min(100 - left, Math.max(0.35, rawWidth));
  const displayUrl = getRequestDisplayUrl(request);
  const displayDuration = formatNetworkDuration(request.durationMs);

  return (
    <button
      type="button"
      className={cn(
        "absolute h-[2px] min-w-px rounded-full transition-[height,opacity] hover:h-1 focus-visible:z-20 focus-visible:h-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 dark:focus-visible:ring-neutral-300",
        isNetworkRequestError(request) ? "bg-red-500" : "bg-dataviz",
        isActive ? "z-10 h-1 bg-accent-500 opacity-100" : "opacity-75"
      )}
      style={{ left: `${left}%`, top: `${lane * 3}px`, width: `${width}%` }}
      onClick={() => onSeek(request.startOffset)}
      title={`${request.method} ${displayUrl} · ${getNetworkStatusLabel(request)} · ${displayDuration}`}
      aria-label={`${request.method} ${displayUrl}, ${displayDuration}`}
    />
  );
});

function getVisibleRequests(
  requests: ParsedNetworkRequest[],
  activeRequests: Set<ParsedNetworkRequest>
): ParsedNetworkRequest[] {
  if (requests.length <= MAX_WATERFALL_REQUESTS) return requests;

  const notable = requests.filter(request => isNetworkRequestError(request) || activeRequests.has(request));
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
