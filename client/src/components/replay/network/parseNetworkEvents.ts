import type {
  CapturedBody,
  CapturedBodyKind,
  CapturedNetworkError,
  CapturedNetworkRequest,
  CapturedNetworkSizes,
  CapturedNetworkTiming,
  NetworkOutcome,
  ParsedNetworkRequest,
  ReplayEventLike,
} from "./types";

export const NETWORK_PLUGIN_NAME = "rrweb/network@1";

const BODY_KINDS = new Set<CapturedBodyKind>([
  "empty",
  "text",
  "json",
  "form-data",
  "url-search-params",
  "blob-metadata",
  "array-buffer-metadata",
  "stream-unavailable",
  "binary-unavailable",
  "unreadable",
  "too-large",
  "timeout",
]);

const NETWORK_OUTCOMES = new Set<NetworkOutcome>([
  "success",
  "http_error",
  "network_error",
  "aborted",
  "timeout",
  "pending_on_unload",
]);

export function parseNetworkEvents(events: readonly ReplayEventLike[] | undefined): ParsedNetworkRequest[] {
  if (!events?.length) {
    return [];
  }

  const replayStartTimestamp = events.find(event => Number.isFinite(event.timestamp))?.timestamp;
  if (replayStartTimestamp === undefined) {
    return [];
  }

  const requests: ParsedNetworkRequest[] = [];
  const seenRequestIds = new Set<string>();

  events.forEach((event, eventIndex) => {
    if (Number(event.type) !== 6 || !isRecord(event.data) || event.data.plugin !== NETWORK_PLUGIN_NAME) {
      return;
    }

    const payload = event.data.payload;
    if (!isRecord(payload) || payload.version !== 1 || !Array.isArray(payload.requests)) {
      return;
    }

    payload.requests.forEach((rawRequest, requestIndex) => {
      const request = parseRequest(rawRequest, event.timestamp, eventIndex, requestIndex);
      if (!request || seenRequestIds.has(request.requestId)) {
        return;
      }

      seenRequestIds.add(request.requestId);
      const startOffset = Math.max(0, request.startedAt - replayStartTimestamp);
      const completedAt = request.completedAt ?? request.startedAt;
      const endOffset = Math.max(startOffset, completedAt - replayStartTimestamp);

      requests.push({
        ...request,
        startOffset,
        endOffset,
      });
    });
  });

  return requests.sort(
    (first, second) => first.startedAt - second.startedAt || first.requestId.localeCompare(second.requestId)
  );
}

function parseRequest(
  value: unknown,
  eventTimestamp: number,
  eventIndex: number,
  requestIndex: number
): CapturedNetworkRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const startedAt = getFiniteNumber(value.startedAt) ?? getFiniteNumber(eventTimestamp);
  if (startedAt === undefined) {
    return undefined;
  }

  const status = getFiniteNumber(value.status);
  const completedAt = getFiniteNumber(value.completedAt);
  const measuredDuration = completedAt === undefined ? undefined : Math.max(0, completedAt - startedAt);
  const durationMs = Math.max(0, getFiniteNumber(value.durationMs) ?? measuredDuration ?? 0);
  const requestId = getString(value.requestId) || `network-${eventIndex}-${requestIndex}`;

  return {
    schemaVersion: 1,
    requestId,
    currentUrl: getString(value.currentUrl),
    url: getString(value.url),
    method: getString(value.method, "GET").toUpperCase(),
    initiatorType: getString(value.initiatorType, "other").toLowerCase(),
    startedAt,
    completedAt,
    durationMs,
    status,
    statusText: getOptionalString(value.statusText),
    outcome: getOutcome(value.outcome, status),
    requestHeaders: getStringRecord(value.requestHeaders),
    responseHeaders: getStringRecord(value.responseHeaders),
    requestBody: getBody(value.requestBody),
    responseBody: getBody(value.responseBody),
    timing: getNumberRecord<CapturedNetworkTiming>(value.timing),
    sizes: getNumberRecord<CapturedNetworkSizes>(value.sizes),
    error: getError(value.error),
    performanceEntryFound: value.performanceEntryFound === true,
    bodyCaptureCompletedAt: getFiniteNumber(value.bodyCaptureCompletedAt),
  };
}

function getOutcome(value: unknown, status: number | undefined): NetworkOutcome {
  if (typeof value === "string" && NETWORK_OUTCOMES.has(value as NetworkOutcome)) {
    return value as NetworkOutcome;
  }

  return status !== undefined && status >= 400 ? "http_error" : "success";
}

function getBody(value: unknown): CapturedBody | undefined {
  if (!isRecord(value) || typeof value.kind !== "string" || !BODY_KINDS.has(value.kind as CapturedBodyKind)) {
    return undefined;
  }

  return {
    kind: value.kind as CapturedBodyKind,
    value: getOptionalString(value.value),
    contentType: getOptionalString(value.contentType),
    sizeBytes: getFiniteNumber(value.sizeBytes),
    truncated: typeof value.truncated === "boolean" ? value.truncated : undefined,
    reason: getOptionalString(value.reason),
  };
}

function getError(value: unknown): CapturedNetworkError | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const error = {
    name: getOptionalString(value.name),
    message: getOptionalString(value.message),
    stack: getOptionalString(value.stack),
  };

  return error.name || error.message || error.stack ? error : undefined;
}

function getNumberRecord<T extends object>(value: unknown): T | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key, getFiniteNumber(entryValue)] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== undefined);

  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

function getStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string | number | boolean] =>
        ["string", "number", "boolean"].includes(typeof entry[1])
      )
      .map(([key, entryValue]) => [key, String(entryValue)])
  );
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
