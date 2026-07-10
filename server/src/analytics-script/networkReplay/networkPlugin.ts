import type { NetworkReplayConfig } from "@rybbit/shared";

import { startNetworkReplayRecorder } from "./index.js";
import type { CapturedBody, CapturedNetworkRequest, NetworkPluginPayload } from "./types.js";
import { getJsonByteSize } from "./utils.js";

export const NETWORK_PLUGIN_NAME = "rrweb/network@1";

export interface NetworkReplayRecordPlugin {
  name: typeof NETWORK_PLUGIN_NAME;
  observer: (callback: (payload: NetworkPluginPayload) => void, pluginWindow: Window, options?: unknown) => () => void;
}

export function getRecordNetworkPlugin(config: NetworkReplayConfig, analyticsHost: string): NetworkReplayRecordPlugin {
  return {
    name: NETWORK_PLUGIN_NAME,
    observer: (callback, pluginWindow) => {
      if (pluginWindow !== window) {
        return () => undefined;
      }

      try {
        return startNetworkReplayRecorder({
          analyticsHost,
          config,
          emit: request => emitNetworkRequest(callback, request, config.maxNetworkEventSizeBytes),
        });
      } catch {
        return () => undefined;
      }
    },
  };
}

function emitNetworkRequest(
  callback: (payload: NetworkPluginPayload) => void,
  request: CapturedNetworkRequest,
  maxEventSizeBytes: number
): void {
  try {
    const payload = createPayload(request);
    if (getPluginEventSizeBytes(payload) <= maxEventSizeBytes) {
      callback(payload);
      return;
    }

    const reducedPayload = createPayload({
      ...request,
      requestBody: removeBodyValue(request.requestBody),
      responseBody: removeBodyValue(request.responseBody),
    });

    if (getPluginEventSizeBytes(reducedPayload) <= maxEventSizeBytes) {
      callback(reducedPayload);
      return;
    }

    console.warn(`[NetworkReplay] Dropped request ${request.requestId}: event exceeds configured size limit`);
  } catch {
    return;
  }
}

function createPayload(request: CapturedNetworkRequest): NetworkPluginPayload {
  return {
    version: 1,
    requests: [request],
  };
}

function getPluginEventSizeBytes(payload: NetworkPluginPayload): number {
  return getJsonByteSize({
    type: 6,
    timestamp: Date.now(),
    data: {
      plugin: NETWORK_PLUGIN_NAME,
      payload,
    },
  });
}

function removeBodyValue(body: CapturedBody | undefined): CapturedBody | undefined {
  if (!body || body.value === undefined) {
    return body;
  }

  return {
    kind: "too-large",
    contentType: body.contentType,
    sizeBytes: body.sizeBytes,
    truncated: true,
    reason: "network_event_size_limit",
  };
}
