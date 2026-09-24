import type { CapturedNetworkRequest } from "@rybbit/shared";

export function sanitizeNetworkUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "[redacted]";
    // Paths are useful for diagnostics but can still contain application identifiers.
    const path = url.pathname.length <= 2048 ? url.pathname : "/[redacted]";
    return `${url.origin}${path}`;
  } catch {
    return "[redacted]";
  }
}

/** Final allowlist covers fetch, XHR, standalone Resource Timing and unload emissions. */
export function toMetadataRequest(request: CapturedNetworkRequest): CapturedNetworkRequest {
  return {
    schemaVersion: request.schemaVersion,
    captureMode: "metadata",
    requestId: request.requestId,
    url: sanitizeNetworkUrl(request.url),
    currentUrl: sanitizeNetworkUrl(request.currentUrl),
    method: request.method,
    initiatorType: request.initiatorType,
    startedAt: request.startedAt,
    completedAt: request.completedAt,
    durationMs: request.durationMs,
    status: request.status,
    outcome: request.outcome,
    requestHeaders: {},
    responseHeaders: {},
    correlationId: request.correlationId,
    traceId: request.traceId,
    timing: request.timing,
    sizes: request.sizes,
    performanceEntryFound: request.performanceEntryFound,
    // Exception messages/stack and statusText can contain URLs, credentials or body data.
    error: request.error
      ? {
          name:
            request.outcome === "aborted"
              ? "AbortError"
              : request.outcome === "timeout"
                ? "TimeoutError"
                : "NetworkError",
        }
      : undefined,
  };
}
