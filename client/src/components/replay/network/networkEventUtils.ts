import type { NetworkRequestFilters, NetworkStatusGroup, ParsedNetworkRequest } from "./types";

export function filterNetworkRequests(
  requests: readonly ParsedNetworkRequest[],
  filters: NetworkRequestFilters
): ParsedNetworkRequest[] {
  const query = filters.query.trim().toLowerCase();

  return requests.filter(request => {
    if (query && !`${request.method} ${request.url} ${request.currentUrl}`.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.method !== "all" && request.method !== filters.method) {
      return false;
    }
    if (filters.host !== "all" && getRequestHost(request) !== filters.host) {
      return false;
    }
    if (filters.initiatorType !== "all" && request.initiatorType !== filters.initiatorType) {
      return false;
    }
    if (filters.fetchXhrOnly && request.initiatorType !== "fetch" && request.initiatorType !== "xmlhttprequest") {
      return false;
    }
    if (request.durationMs < filters.minDurationMs) {
      return false;
    }

    return matchesStatusGroup(request, filters.statusGroup);
  });
}

export function getRequestHost(request: ParsedNetworkRequest): string {
  if (!request.url) {
    return "unknown";
  }

  try {
    return new URL(request.url).hostname || "unknown";
  } catch {
    try {
      return request.currentUrl ? new URL(request.url, request.currentUrl).hostname || "unknown" : "unknown";
    } catch {
      return "unknown";
    }
  }
}

export function getRequestDisplayUrl(request: ParsedNetworkRequest): string {
  if (!request.url) {
    return "—";
  }

  try {
    const requestUrl = new URL(request.url, request.currentUrl || undefined);
    const currentHost = request.currentUrl ? new URL(request.currentUrl).host : requestUrl.host;
    const path = `${requestUrl.pathname || "/"}${requestUrl.search}`;
    return requestUrl.host && requestUrl.host !== currentHost ? `${requestUrl.host}${path}` : path;
  } catch {
    return request.url;
  }
}

export function getNetworkStatusLabel(request: ParsedNetworkRequest): string {
  if (request.status !== undefined) {
    return String(request.status);
  }

  switch (request.outcome) {
    case "aborted":
      return "ABRT";
    case "network_error":
      return "ERR";
    case "pending_on_unload":
      return "PEND";
    case "timeout":
      return "TIME";
    default:
      return "—";
  }
}

export function getInitiatorLabel(initiatorType: string): string {
  if (initiatorType === "xmlhttprequest") {
    return "XHR";
  }
  if (!initiatorType || initiatorType === "other") {
    return "Other";
  }
  return `${initiatorType.charAt(0).toUpperCase()}${initiatorType.slice(1)}`;
}

export function formatNetworkOffset(offsetMs: number): string {
  const safeOffset = Math.max(0, Math.floor(offsetMs));
  const minutes = Math.floor(safeOffset / 60_000);
  const seconds = Math.floor((safeOffset % 60_000) / 1_000);
  const milliseconds = safeOffset % 1_000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function formatNetworkDuration(durationMs: number): string {
  if (durationMs < 1) {
    return "<1 ms";
  }
  if (durationMs < 1_000) {
    return `${Math.round(durationMs)} ms`;
  }
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 2 : 1)} s`;
}

export function formatTransferSize(sizeBytes: number | undefined): string | undefined {
  if (sizeBytes === undefined || sizeBytes < 0) {
    return undefined;
  }
  if (sizeBytes < 1_000) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1_000_000) {
    return `${(sizeBytes / 1_000).toFixed(1)} kB`;
  }
  return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
}

export function isNetworkRequestError(request: ParsedNetworkRequest): boolean {
  return request.outcome !== "success" || (request.status !== undefined && request.status >= 400);
}

function matchesStatusGroup(request: ParsedNetworkRequest, statusGroup: NetworkStatusGroup): boolean {
  if (statusGroup === "all") {
    return true;
  }
  if (statusGroup === "errors") {
    return isNetworkRequestError(request);
  }

  return request.status !== undefined && Math.floor(request.status / 100) === Number(statusGroup[0]);
}
