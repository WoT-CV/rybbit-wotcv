import type { NetworkReplayConfig } from "@rybbit/shared";

import { observeFetch } from "./fetchObserver.js";
import { PendingRequests } from "./pendingRequests.js";
import { observePerformance, type NetworkPerformanceObserver } from "./performanceObserver.js";
import type { NetworkRequestEmitter } from "./types.js";
import { observeXhr } from "./xhrObserver.js";

export * from "./bodyCapture.js";
export * from "./headerCapture.js";
export * from "./ignoredTrackerRequests.js";
export * from "./pendingRequests.js";
export * from "./performanceObserver.js";
export * from "./timing.js";
export * from "./types.js";
export * from "./utils.js";

export interface StartNetworkReplayRecorderOptions {
  analyticsHost: string;
  config: NetworkReplayConfig;
  emit: NetworkRequestEmitter;
}

export function startNetworkReplayRecorder({
  analyticsHost,
  config,
  emit,
}: StartNetworkReplayRecorderOptions): () => void {
  if (!config.enabled) {
    return () => undefined;
  }

  const pendingRequests = new PendingRequests(emit);
  const cleanupObservers: Array<() => void> = [];
  let performanceObserver: NetworkPerformanceObserver | undefined;

  if (config.capturePerformanceResources) {
    try {
      performanceObserver = observePerformance({ analyticsHost, config, emit, pendingRequests });
    } catch {
      performanceObserver = undefined;
    }
  }

  if (config.captureFetch) {
    try {
      cleanupObservers.push(observeFetch({ analyticsHost, config, pendingRequests, performanceObserver }));
    } catch {
      cleanupObservers.push(() => undefined);
    }
  }

  if (config.captureXhr) {
    try {
      cleanupObservers.push(observeXhr({ analyticsHost, config, pendingRequests, performanceObserver }));
    } catch {
      cleanupObservers.push(() => undefined);
    }
  }

  let stopped = false;
  return () => {
    if (stopped) {
      return;
    }

    stopped = true;
    performanceObserver?.stop();
    pendingRequests.finalizePendingOnUnload();
    cleanupObservers.forEach(cleanup => {
      try {
        cleanup();
      } catch {
        return;
      }
    });
  };
}
