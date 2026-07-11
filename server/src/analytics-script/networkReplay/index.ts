import type { NetworkReplayConfig } from "@rybbit/shared";

import { observeFetch } from "./fetchObserver.js";
import { PendingRequests } from "./pendingRequests.js";
import { observePerformance, type NetworkPerformanceObserver } from "./performanceObserver.js";
import { RecorderLifecycle } from "./recorderLifecycle.js";
import type { NetworkRequestEmitter } from "./types.js";
import { observeXhr } from "./xhrObserver.js";

export * from "./bodyCapture.js";
export * from "./headerCapture.js";
export * from "./ignoredTrackerRequests.js";
export * from "./pendingRequests.js";
export * from "./performanceObserver.js";
export * from "./recorderLifecycle.js";
export * from "./timing.js";
export * from "./types.js";
export * from "./utils.js";

export interface StartNetworkReplayRecorderOptions {
  analyticsHost: string;
  config: NetworkReplayConfig;
  emit: NetworkRequestEmitter;
}

let stopActiveRecorder: (() => void) | undefined;

export function startNetworkReplayRecorder({
  analyticsHost,
  config,
  emit,
}: StartNetworkReplayRecorderOptions): () => void {
  stopActiveRecorder?.();
  stopActiveRecorder = undefined;

  if (!config.enabled) {
    return () => undefined;
  }

  const pendingRequests = new PendingRequests(emit);
  const lifecycle = new RecorderLifecycle();
  let performanceObserver: NetworkPerformanceObserver | undefined;

  if (config.capturePerformanceResources) {
    try {
      performanceObserver = observePerformance({ analyticsHost, config, emit, pendingRequests });
      lifecycle.add(() => performanceObserver?.stop());
    } catch {
      performanceObserver = undefined;
    }
  }

  if (config.captureFetch) {
    try {
      lifecycle.add(observeFetch({ analyticsHost, config, pendingRequests, performanceObserver }));
    } catch {}
  }

  if (config.captureXhr) {
    try {
      lifecycle.add(observeXhr({ analyticsHost, config, pendingRequests, performanceObserver }));
    } catch {}
  }

  let stopped = false;
  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    lifecycle.stop();
    pendingRequests.finalizePendingOnUnload();
    if (stopActiveRecorder === stop) stopActiveRecorder = undefined;
  };

  stopActiveRecorder = stop;
  return stop;
}
