import type { NetworkReplayConfig } from "@rybbit/shared";

import {
  captureBodyValue,
  captureRequestBody,
  captureResponseBody,
  createUnavailableBody,
  type BodyCaptureLimits,
} from "./bodyCapture.js";
import { captureHeaders } from "./headerCapture.js";
import { isIgnoredTrackerRequest } from "./ignoredTrackerRequests.js";
import { PendingRequests } from "./pendingRequests.js";
import type { NetworkPerformanceObserver } from "./performanceObserver.js";
import type { CapturedBody, CapturedNetworkRequestDraft, NetworkOutcome } from "./types.js";
import {
  createRequestId,
  getCurrentUrl,
  getDurationMs,
  getErrorDetails,
  getFetchInputUrl,
  isAbortError,
  toAbsoluteUrl,
} from "./utils.js";

interface FetchObserverOptions {
  analyticsHost: string;
  config: NetworkReplayConfig;
  pendingRequests: PendingRequests;
  performanceObserver?: NetworkPerformanceObserver;
}

interface FetchCaptureContext {
  requestId: string;
  startedAt: number;
}

export function observeFetch({
  analyticsHost,
  config,
  pendingRequests,
  performanceObserver,
}: FetchObserverOptions): () => void {
  if (typeof window.fetch !== "function") {
    return () => undefined;
  }

  const originalFetch = window.fetch;
  const bodyCaptureLimits: BodyCaptureLimits = config;

  const observedFetch = function (this: Window, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let requestUrl: string;
    try {
      requestUrl = toAbsoluteUrl(getFetchInputUrl(input));
    } catch {
      return Reflect.apply(originalFetch, this, [input, init]);
    }

    if (isIgnoredTrackerRequest(requestUrl, analyticsHost)) {
      return Reflect.apply(originalFetch, this, [input, init]);
    }

    let captureContext: FetchCaptureContext | undefined;
    try {
      captureContext = registerFetchRequest(
        input,
        init,
        requestUrl,
        config,
        bodyCaptureLimits,
        pendingRequests,
        performanceObserver
      );
    } catch {
      captureContext = undefined;
    }

    let fetchPromise: Promise<Response>;
    try {
      fetchPromise = Reflect.apply(originalFetch, this, [input, init]);
    } catch (error) {
      if (captureContext) {
        completeFetchError(captureContext, error, pendingRequests, performanceObserver);
      }
      throw error;
    }

    if (!captureContext) {
      return fetchPromise;
    }

    return fetchPromise.then(
      response => {
        try {
          completeFetchResponse(
            captureContext,
            response,
            config,
            bodyCaptureLimits,
            pendingRequests,
            performanceObserver
          );
        } catch {
          completeFetchResponseWithoutBody(captureContext, response, config, pendingRequests, performanceObserver);
        }
        return response;
      },
      error => {
        completeFetchError(captureContext, error, pendingRequests, performanceObserver);
        throw error;
      }
    );
  } as typeof window.fetch;

  window.fetch = observedFetch;

  return () => {
    if (window.fetch === observedFetch) {
      window.fetch = originalFetch;
    }
  };
}

function registerFetchRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  requestUrl: string,
  config: NetworkReplayConfig,
  limits: BodyCaptureLimits,
  pendingRequests: PendingRequests,
  performanceObserver?: NetworkPerformanceObserver
): FetchCaptureContext {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const capturedRequest = createCapturedRequest(input, init);
  const method = (capturedRequest?.method || init?.method || getInputRequestMethod(input) || "GET").toUpperCase();
  const effectiveHeaders = capturedRequest?.headers || getInputRequestHeaders(input, init);
  const capturedHeaders = config.captureRequestHeaders ? captureHeaders(effectiveHeaders) : {};
  const requestBody = config.captureRequestBody
    ? createFetchRequestBodyCapture(input, init, capturedRequest, effectiveHeaders, limits)
    : undefined;
  const request: CapturedNetworkRequestDraft = {
    schemaVersion: 1,
    requestId,
    currentUrl: getCurrentUrl(),
    url: requestUrl,
    method,
    initiatorType: "fetch",
    startedAt,
    requestHeaders: capturedHeaders,
    responseHeaders: {},
    performanceEntryFound: false,
  };

  pendingRequests.register(request, requestBody);
  performanceObserver?.registerRequest(requestId, requestUrl, "fetch", startedAt);
  return { requestId, startedAt };
}

function completeFetchResponse(
  context: FetchCaptureContext,
  response: Response,
  config: NetworkReplayConfig,
  limits: BodyCaptureLimits,
  pendingRequests: PendingRequests,
  performanceObserver?: NetworkPerformanceObserver
): void {
  const completedAt = Date.now();
  const responseBody = config.captureResponseBody ? captureResponseBody(response.clone(), limits) : undefined;
  const performanceTask = performanceObserver?.completeRequest(context.requestId, completedAt, response.url);

  pendingRequests.complete(
    context.requestId,
    {
      completedAt,
      durationMs: getDurationMs(context.startedAt, completedAt),
      outcome: getHttpOutcome(response.status),
      responseHeaders: config.captureResponseHeaders ? captureHeaders(response.headers) : {},
      status: response.status,
      statusText: response.statusText,
    },
    responseBody,
    performanceTask
  );
}

function completeFetchResponseWithoutBody(
  context: FetchCaptureContext,
  response: Response,
  config: NetworkReplayConfig,
  pendingRequests: PendingRequests,
  performanceObserver?: NetworkPerformanceObserver
): void {
  const completedAt = Date.now();
  const responseBody = config.captureResponseBody
    ? Promise.resolve(createUnavailableBody("unreadable", "Response body could not be cloned"))
    : undefined;
  const performanceTask = performanceObserver?.completeRequest(context.requestId, completedAt, response.url);

  pendingRequests.complete(
    context.requestId,
    {
      completedAt,
      durationMs: getDurationMs(context.startedAt, completedAt),
      outcome: getHttpOutcome(response.status),
      responseHeaders: config.captureResponseHeaders ? captureHeaders(response.headers) : {},
      status: response.status,
      statusText: response.statusText,
    },
    responseBody,
    performanceTask
  );
}

function completeFetchError(
  context: FetchCaptureContext,
  error: unknown,
  pendingRequests: PendingRequests,
  performanceObserver?: NetworkPerformanceObserver
): void {
  const completedAt = Date.now();
  const performanceTask = performanceObserver?.completeRequest(context.requestId, completedAt);
  pendingRequests.complete(
    context.requestId,
    {
      completedAt,
      durationMs: getDurationMs(context.startedAt, completedAt),
      error: getErrorDetails(error),
      outcome: isAbortError(error) ? "aborted" : "network_error",
      responseHeaders: {},
    },
    undefined,
    performanceTask
  );
}

function createCapturedRequest(input: RequestInfo | URL, init?: RequestInit): Request | undefined {
  try {
    const captureInput = typeof Request !== "undefined" && input instanceof Request ? input.clone() : input;
    return new Request(captureInput, init);
  } catch {
    return undefined;
  }
}

function createFetchRequestBodyCapture(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  capturedRequest: Request | undefined,
  headers: Headers | HeadersInit | undefined,
  limits: BodyCaptureLimits
): Promise<CapturedBody> {
  const contentType = captureHeaders(headers)["content-type"];

  if (init?.body !== undefined && init.body !== null) {
    return captureBodyValue(init.body, contentType, limits);
  }

  if (capturedRequest) {
    try {
      return captureRequestBody(capturedRequest.clone(), limits);
    } catch {
      return Promise.resolve(createUnavailableBody("unreadable", "Request body could not be cloned", contentType));
    }
  }

  if (typeof Request !== "undefined" && input instanceof Request && input.body) {
    return Promise.resolve(createUnavailableBody("unreadable", "Request body could not be cloned", contentType));
  }

  return Promise.resolve({ kind: "empty", contentType, sizeBytes: 0 });
}

function getInputRequestMethod(input: RequestInfo | URL): string | undefined {
  return typeof Request !== "undefined" && input instanceof Request ? input.method : undefined;
}

function getInputRequestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers | HeadersInit | undefined {
  if (init?.headers) {
    return init.headers;
  }

  return typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined;
}

function getHttpOutcome(status: number): NetworkOutcome {
  return status >= 400 ? "http_error" : "success";
}
