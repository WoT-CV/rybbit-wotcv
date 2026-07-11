import type { VirtualItem } from "@tanstack/react-virtual";
import { AlertTriangle, ArrowLeftRight, FileCode2, Globe2, ImageIcon, Navigation, Network } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  formatNetworkDuration,
  formatNetworkOffset,
  formatTransferSize,
  getNetworkTransferSize,
  getNetworkStatusLabel,
  getRequestDisplayUrl,
  isNetworkRequestError,
} from "./networkEventUtils";
import type { ParsedNetworkRequest } from "./types";

interface NetworkRequestRowProps {
  request: ParsedNetworkRequest;
  isActive: boolean;
  virtualRow: VirtualItem;
  measure: (node: Element | null) => void;
  onSelect: (request: ParsedNetworkRequest) => void;
}

export function NetworkRequestRow({ request, isActive, virtualRow, measure, onSelect }: NetworkRequestRowProps) {
  const InitiatorIcon = getInitiatorIcon(request.initiatorType);
  const displayUrl = getRequestDisplayUrl(request);
  const statusLabel = getNetworkStatusLabel(request);
  const transferSize = formatTransferSize(getNetworkTransferSize(request));
  const isError = isNetworkRequestError(request);

  return (
    <button
      type="button"
      data-index={virtualRow.index}
      ref={measure}
      className={cn(
        "absolute left-0 right-0 flex w-full items-start gap-2 border-b border-neutral-100 px-2.5 py-2 text-left",
        "transition-colors hover:bg-neutral-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-950",
        "dark:border-neutral-800 dark:hover:bg-neutral-800/60 dark:focus-visible:ring-neutral-300",
        isActive && "bg-accent-500/10 dark:bg-accent-500/10"
      )}
      style={{ top: `${virtualRow.start}px` }}
      onClick={() => onSelect(request)}
      title={request.url}
      aria-label={`${request.method} ${displayUrl}, ${statusLabel}, ${formatNetworkDuration(request.durationMs)}`}
    >
      <span className="w-[52px] shrink-0 pt-0.5 text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
        {formatNetworkOffset(request.startOffset)}
      </span>
      <InitiatorIcon
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500 dark:text-neutral-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded bg-neutral-100 px-1 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {request.method}
          </span>
          <span className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-200">{displayUrl}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
          {isError && <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />}
          <span className={getStatusClassName(request)}>{statusLabel}</span>
          <span>{formatNetworkDuration(request.durationMs)}</span>
          {transferSize && <span>{transferSize}</span>}
        </div>
      </div>
    </button>
  );
}

function getInitiatorIcon(initiatorType: string) {
  switch (initiatorType) {
    case "fetch":
      return Network;
    case "xmlhttprequest":
      return ArrowLeftRight;
    case "script":
      return FileCode2;
    case "img":
    case "image":
      return ImageIcon;
    case "navigation":
      return Navigation;
    default:
      return Globe2;
  }
}

function getStatusClassName(request: ParsedNetworkRequest): string {
  if (request.outcome === "pending_on_unload") {
    return "font-medium text-blue-500 dark:text-blue-400";
  }
  if (request.outcome === "network_error" || request.outcome === "aborted" || request.outcome === "timeout") {
    return "font-medium text-red-500 dark:text-red-400";
  }
  if (request.status !== undefined && request.status >= 500) {
    return "font-medium text-red-500 dark:text-red-400";
  }
  if (request.status !== undefined && request.status >= 400) {
    return "font-medium text-yellow-600 dark:text-yellow-400";
  }
  if (request.status !== undefined && request.status >= 200 && request.status < 400) {
    return "font-medium text-emerald-600 dark:text-emerald-400";
  }
  return "font-medium text-neutral-600 dark:text-neutral-300";
}
