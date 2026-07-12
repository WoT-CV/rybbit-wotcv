import type { NetworkRequestFilters, NetworkStatusGroup, ParsedNetworkRequest } from "./types";

export const DEFAULT_REPLAY_NETWORK_HOST = "api.wot-cv.com";

export function getDefaultNetworkHost(requests: readonly ParsedNetworkRequest[]): string {
  return requests.some(request => getRequestHost(request) === DEFAULT_REPLAY_NETWORK_HOST)
    ? DEFAULT_REPLAY_NETWORK_HOST
    : "all";
}

export function filterNetworkRequests(
  requests: readonly ParsedNetworkRequest[],
  filters: NetworkRequestFilters
): ParsedNetworkRequest[] {
  const query = filters.query.trim().toLowerCase();

  return requests.filter(request => {
    if (query && !request.searchText.includes(query)) {
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
  return request.host;
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

export function getNetworkTransferSize(request: ParsedNetworkRequest): number | undefined {
  return getNetworkTransferSizeInfo(request)?.bytes;
}

export type NetworkTransferSizeSource = "performance" | "content-length" | "encoded-body" | "captured-body";

export function getNetworkTransferSizeInfo(
  request: ParsedNetworkRequest
): { bytes: number; source: NetworkTransferSizeSource } | undefined {
  const transferSize = request.sizes?.transferSize;
  if (transferSize !== undefined && transferSize > 0) {
    return { bytes: transferSize, source: "performance" };
  }

  const contentLength = getHeaderNumber(request.responseHeaders, "content-length");
  if (contentLength !== undefined) {
    return { bytes: contentLength, source: "content-length" };
  }

  const encodedBodySize = request.sizes?.encodedBodySize;
  if (encodedBodySize !== undefined && encodedBodySize > 0) {
    return { bytes: encodedBodySize, source: "encoded-body" };
  }

  const capturedBodySize = request.responseBody?.sizeBytes;
  return capturedBodySize === undefined ? undefined : { bytes: capturedBodySize, source: "captured-body" };
}

export function getResponseCorrelationId(request: ParsedNetworkRequest): string | undefined {
  return getHeaderValue(request.responseHeaders, ["x-correlation-id", "correlation-id"]);
}

export function isNetworkRequestError(request: ParsedNetworkRequest): boolean {
  return request.outcome !== "success" || (request.status !== undefined && request.status >= 400);
}

function getHeaderValue(headers: Record<string, string>, names: string[]): string | undefined {
  const normalizedNames = new Set(names.map(name => name.toLowerCase()));
  for (const [name, value] of Object.entries(headers)) {
    if (normalizedNames.has(name.toLowerCase()) && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getHeaderNumber(headers: Record<string, string>, name: string): number | undefined {
  const value = getHeaderValue(headers, [name]);
  if (!value) {
    return undefined;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : undefined;
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
