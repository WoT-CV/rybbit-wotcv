import type { NetworkReplayConfig } from "@rybbit/shared";

import { captureBodyValue, captureXhrResponseBody, type BodyCaptureLimits } from "./bodyCapture.js";
import { appendCapturedHeader, getCapturedHeader, parseXhrResponseHeaders } from "./headerCapture.js";
import { isIgnoredTrackerRequest } from "./ignoredTrackerRequests.js";
import { PendingRequests } from "./pendingRequests.js";
import type { CapturedNetworkError, CapturedNetworkRequestDraft, NetworkOutcome } from "./types.js";
import { createRequestId, getCurrentUrl, getDurationMs, getErrorDetails, toAbsoluteUrl } from "./utils.js";

interface XhrObserverOptions {
  analyticsHost: string;
  config: NetworkReplayConfig;
  pendingRequests: PendingRequests;
}

interface XhrListeners {
  abort: EventListener;
  error: EventListener;
  loadend: EventListener;
  timeout: EventListener;
}

interface XhrRequestState {
  xhr: XMLHttpRequest;
  requestId: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  ignored: boolean;
  startedAt?: number;
  registered: boolean;
  finalized: boolean;
  outcome?: NetworkOutcome;
  error?: CapturedNetworkError;
  listeners?: XhrListeners;
}

export function observeXhr({ analyticsHost, config, pendingRequests }: XhrObserverOptions): () => void {
  if (typeof XMLHttpRequest === "undefined") {
    return () => undefined;
  }

  const prototype = XMLHttpRequest.prototype;
  const originalOpen = prototype.open;
  const originalSend = prototype.send;
  const originalSetRequestHeader = prototype.setRequestHeader;
  const states = new WeakMap<XMLHttpRequest, XhrRequestState>();
  const activeStates = new Set<XhrRequestState>();
  const limits: BodyCaptureLimits = config;

  const observedOpen = function (this: XMLHttpRequest, ...args: unknown[]): void {
    Reflect.apply(originalOpen, this, args);

    try {
      const previousState = states.get(this);
      if (previousState) {
        cleanupListeners(previousState, activeStates);
        finalizeReopenedRequest(previousState, pendingRequests);
      }

      const method = String(args[0] || "GET").toUpperCase();
      const url = toAbsoluteUrl(String(args[1] || ""));
      states.set(this, {
        xhr: this,
        requestId: createRequestId(),
        method,
        url,
        requestHeaders: {},
        ignored: isIgnoredTrackerRequest(url, analyticsHost),
        registered: false,
        finalized: false,
      });
    } catch {
      states.delete(this);
    }
  };

  const observedSetRequestHeader = function (this: XMLHttpRequest, name: string, value: string): void {
    Reflect.apply(originalSetRequestHeader, this, [name, value]);
    const state = states.get(this);
    if (state && !state.ignored) {
      appendCapturedHeader(state.requestHeaders, name, value);
    }
  };

  const observedSend = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    const state = states.get(this);
    if (!state || state.ignored) {
      Reflect.apply(originalSend, this, [body]);
      return;
    }

    try {
      prepareXhrCapture(state, body, config, limits, pendingRequests, activeStates);
    } catch {
      cleanupListeners(state, activeStates);
      Reflect.apply(originalSend, this, [body]);
      return;
    }

    try {
      Reflect.apply(originalSend, this, [body]);
    } catch (error) {
      state.outcome = "network_error";
      state.error = getErrorDetails(error);
      finalizeXhrRequest(state, config, limits, pendingRequests, activeStates);
      throw error;
    }
  };

  prototype.open = observedOpen as typeof prototype.open;
  prototype.setRequestHeader = observedSetRequestHeader as typeof prototype.setRequestHeader;
  prototype.send = observedSend as typeof prototype.send;

  return () => {
    for (const state of activeStates) {
      cleanupListeners(state, activeStates);
    }

    if (prototype.open === observedOpen) {
      prototype.open = originalOpen;
    }
    if (prototype.setRequestHeader === observedSetRequestHeader) {
      prototype.setRequestHeader = originalSetRequestHeader;
    }
    if (prototype.send === observedSend) {
      prototype.send = originalSend;
    }
  };
}

function prepareXhrCapture(
  state: XhrRequestState,
  body: Document | XMLHttpRequestBodyInit | null | undefined,
  config: NetworkReplayConfig,
  limits: BodyCaptureLimits,
  pendingRequests: PendingRequests,
  activeStates: Set<XhrRequestState>
): void {
  state.startedAt = Date.now();
  const contentType = getCapturedHeader(state.requestHeaders, "content-type");
  const requestBody = config.captureRequestBody ? captureBodyValue(body, contentType, limits) : undefined;
  const request: CapturedNetworkRequestDraft = {
    schemaVersion: 1,
    requestId: state.requestId,
    currentUrl: getCurrentUrl(),
    url: state.url,
    method: state.method,
    initiatorType: "xmlhttprequest",
    startedAt: state.startedAt,
    requestHeaders: config.captureRequestHeaders ? { ...state.requestHeaders } : {},
    responseHeaders: {},
    performanceEntryFound: false,
  };

  const listeners: XhrListeners = {
    abort: () => {
      state.outcome = "aborted";
      state.error = { name: "AbortError", message: "XMLHttpRequest was aborted" };
    },
    error: () => {
      state.outcome = "network_error";
      state.error = { name: "NetworkError", message: "XMLHttpRequest failed" };
    },
    loadend: () => finalizeXhrRequest(state, config, limits, pendingRequests, activeStates),
    timeout: () => {
      state.outcome = "timeout";
      state.error = { name: "TimeoutError", message: "XMLHttpRequest timed out" };
    },
  };

  state.listeners = listeners;
  state.xhr.addEventListener("abort", listeners.abort);
  state.xhr.addEventListener("error", listeners.error);
  state.xhr.addEventListener("loadend", listeners.loadend);
  state.xhr.addEventListener("timeout", listeners.timeout);
  activeStates.add(state);
  pendingRequests.register(request, requestBody);
  state.registered = true;
}

function finalizeXhrRequest(
  state: XhrRequestState,
  config: NetworkReplayConfig,
  limits: BodyCaptureLimits,
  pendingRequests: PendingRequests,
  activeStates: Set<XhrRequestState>
): void {
  if (state.finalized || !state.registered || state.startedAt === undefined) {
    return;
  }

  state.finalized = true;
  cleanupListeners(state, activeStates);

  const completedAt = Date.now();
  const status = getXhrStatus(state.xhr);
  const allResponseHeaders = getXhrResponseHeaders(state.xhr);
  const responseContentType = getCapturedHeader(allResponseHeaders, "content-type");
  const responseBody = config.captureResponseBody
    ? captureXhrResponseBody(state.xhr, responseContentType, limits)
    : undefined;

  pendingRequests.complete(
    state.requestId,
    {
      completedAt,
      durationMs: getDurationMs(state.startedAt, completedAt),
      error: state.error,
      outcome: state.outcome ?? getXhrOutcome(status),
      responseHeaders: config.captureResponseHeaders ? allResponseHeaders : {},
      status,
      statusText: getXhrStatusText(state.xhr),
    },
    responseBody
  );
}

function finalizeReopenedRequest(state: XhrRequestState, pendingRequests: PendingRequests): void {
  if (!state.registered || state.finalized || state.startedAt === undefined) {
    return;
  }

  const completedAt = Date.now();
  state.finalized = true;
  pendingRequests.complete(state.requestId, {
    completedAt,
    durationMs: getDurationMs(state.startedAt, completedAt),
    error: { name: "AbortError", message: "XMLHttpRequest was reopened before completion" },
    outcome: "aborted",
    responseHeaders: {},
  });
}

function cleanupListeners(state: XhrRequestState, activeStates: Set<XhrRequestState>): void {
  if (!state.listeners) {
    activeStates.delete(state);
    return;
  }

  state.xhr.removeEventListener("abort", state.listeners.abort);
  state.xhr.removeEventListener("error", state.listeners.error);
  state.xhr.removeEventListener("loadend", state.listeners.loadend);
  state.xhr.removeEventListener("timeout", state.listeners.timeout);
  state.listeners = undefined;
  activeStates.delete(state);
}

function getXhrResponseHeaders(xhr: XMLHttpRequest): Record<string, string> {
  try {
    return parseXhrResponseHeaders(xhr.getAllResponseHeaders());
  } catch {
    return {};
  }
}

function getXhrStatus(xhr: XMLHttpRequest): number | undefined {
  try {
    return xhr.status;
  } catch {
    return undefined;
  }
}

function getXhrStatusText(xhr: XMLHttpRequest): string | undefined {
  try {
    return xhr.statusText || undefined;
  } catch {
    return undefined;
  }
}

function getXhrOutcome(status?: number): NetworkOutcome {
  if (!status) {
    return "network_error";
  }
  return status >= 400 ? "http_error" : "success";
}
