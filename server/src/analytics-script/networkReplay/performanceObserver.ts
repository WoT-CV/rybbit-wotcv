import type { NetworkReplayConfig } from "@rybbit/shared";

import { isIgnoredTrackerRequest } from "./ignoredTrackerRequests.js";
import { PendingRequests } from "./pendingRequests.js";
import {
  getPerformanceEntryCompletedAt,
  getPerformanceEntryInitiatorType,
  getPerformanceEntrySizes,
  getPerformanceEntryStartedAt,
  getPerformanceEntryStatus,
  getPerformanceEntryTiming,
  isSupportedPerformanceEntry,
  type SupportedPerformanceEntry,
} from "./timing.js";
import type { CapturedNetworkRequest, NetworkRequestEmitter } from "./types.js";
import { createRequestId, getCurrentUrl, toAbsoluteUrl } from "./utils.js";

const MATCH_TOLERANCE_MS = 250;
const MATCH_WAIT_MS = 250;
const UNMATCHED_ENTRY_WAIT_MS = 250;

interface PerformanceObserverOptions {
  analyticsHost: string;
  config: NetworkReplayConfig;
  emit: NetworkRequestEmitter;
  pendingRequests: PendingRequests;
}

interface WrapperRequestCandidate {
  requestId: string;
  urls: Set<string>;
  initiatorType: "fetch" | "xmlhttprequest";
  startedAt: number;
  completedAt?: number;
  matched: boolean;
  timeoutId?: number;
  resolve?: () => void;
}

interface ObservedPerformanceEntry {
  entry: SupportedPerformanceEntry;
  key: string;
  claimed: boolean;
  timeoutId?: number;
}

export interface NetworkPerformanceObserver {
  registerRequest(requestId: string, url: string, initiatorType: "fetch" | "xmlhttprequest", startedAt: number): void;
  completeRequest(requestId: string, completedAt: number, finalUrl?: string): Promise<void>;
  stop(): void;
}

export function observePerformance({
  analyticsHost,
  config,
  emit,
  pendingRequests,
}: PerformanceObserverOptions): NetworkPerformanceObserver {
  const coordinator = new PerformanceObserverCoordinator(analyticsHost, emit, pendingRequests);
  coordinator.start(config.captureInitialPerformanceResources);
  return coordinator;
}

class PerformanceObserverCoordinator implements NetworkPerformanceObserver {
  private readonly candidates = new Map<string, WrapperRequestCandidate>();
  private readonly observedEntries = new Map<string, ObservedPerformanceEntry>();
  private readonly seenEntryKeys = new Set<string>();
  private readonly observers: PerformanceObserver[] = [];
  private matchingEnabled = false;
  private stopped = false;

  constructor(
    private readonly analyticsHost: string,
    private readonly emit: NetworkRequestEmitter,
    private readonly pendingRequests: PendingRequests
  ) {}

  start(captureInitialEntries: boolean): void {
    if (typeof PerformanceObserver === "undefined" || typeof performance === "undefined") {
      return;
    }

    this.matchingEnabled = this.observeEntryType("resource", captureInitialEntries);
    this.observeEntryType("navigation", captureInitialEntries);

    if (captureInitialEntries) {
      this.handleEntries(performance.getEntriesByType("resource"));
      this.handleEntries(performance.getEntriesByType("navigation"));
    }
  }

  registerRequest(requestId: string, url: string, initiatorType: "fetch" | "xmlhttprequest", startedAt: number): void {
    if (this.stopped || !this.matchingEnabled) {
      return;
    }

    const candidate: WrapperRequestCandidate = {
      requestId,
      urls: new Set([toAbsoluteUrl(url)]),
      initiatorType,
      startedAt,
      matched: false,
    };
    this.candidates.set(requestId, candidate);
    this.tryMatchCandidate(candidate);
  }

  completeRequest(requestId: string, completedAt: number, finalUrl?: string): Promise<void> {
    const candidate = this.candidates.get(requestId);
    if (!candidate || this.stopped) {
      return Promise.resolve();
    }

    candidate.completedAt = completedAt;
    if (finalUrl) {
      candidate.urls.add(toAbsoluteUrl(finalUrl));
    }

    this.tryMatchCandidate(candidate);
    if (candidate.matched) {
      this.finishCandidate(candidate);
      return Promise.resolve();
    }

    return new Promise(resolve => {
      candidate.resolve = resolve;
      candidate.timeoutId = window.setTimeout(() => this.finishCandidate(candidate), MATCH_WAIT_MS);
    });
  }

  stop(): void {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.observers.forEach(observer => observer.disconnect());

    for (const observedEntry of this.observedEntries.values()) {
      if (!observedEntry.claimed) {
        this.emitStandaloneEntry(observedEntry);
      }
    }

    for (const candidate of this.candidates.values()) {
      this.finishCandidate(candidate);
    }

    this.observedEntries.clear();
    this.candidates.clear();
  }

  private observeEntryType(type: "resource" | "navigation", buffered: boolean): boolean {
    if (PerformanceObserver.supportedEntryTypes && !PerformanceObserver.supportedEntryTypes.includes(type)) {
      return false;
    }

    const observer = new PerformanceObserver(list => this.handleEntries(list.getEntries()));
    try {
      observer.observe({ type, buffered });
    } catch {
      try {
        observer.observe({ entryTypes: [type] });
      } catch {
        observer.disconnect();
        return false;
      }
    }

    this.observers.push(observer);
    return true;
  }

  private handleEntries(entries: PerformanceEntry[]): void {
    if (this.stopped) {
      return;
    }

    for (const entry of entries) {
      if (!isSupportedPerformanceEntry(entry) || isIgnoredTrackerRequest(entry.name, this.analyticsHost)) {
        continue;
      }

      const key = createPerformanceEntryKey(entry);
      if (this.seenEntryKeys.has(key)) {
        continue;
      }

      this.seenEntryKeys.add(key);
      const observedEntry: ObservedPerformanceEntry = {
        entry,
        key,
        claimed: false,
      };
      this.observedEntries.set(key, observedEntry);

      const candidate = this.findMatchingCandidate(entry);
      if (candidate) {
        this.claimEntry(observedEntry, candidate);
      } else if (entry.entryType === "navigation") {
        this.emitStandaloneEntry(observedEntry);
      } else {
        observedEntry.timeoutId = window.setTimeout(
          () => this.emitStandaloneEntry(observedEntry),
          UNMATCHED_ENTRY_WAIT_MS
        );
      }
    }
  }

  private tryMatchCandidate(candidate: WrapperRequestCandidate): void {
    if (candidate.matched) {
      return;
    }

    let closestEntry: ObservedPerformanceEntry | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const observedEntry of this.observedEntries.values()) {
      if (observedEntry.claimed || !this.isEntryMatch(observedEntry.entry, candidate)) {
        continue;
      }

      const distance = Math.abs(getPerformanceEntryStartedAt(observedEntry.entry) - candidate.startedAt);
      if (distance < closestDistance) {
        closestEntry = observedEntry;
        closestDistance = distance;
      }
    }

    if (closestEntry) {
      this.claimEntry(closestEntry, candidate);
    }
  }

  private findMatchingCandidate(entry: SupportedPerformanceEntry): WrapperRequestCandidate | undefined {
    let closestCandidate: WrapperRequestCandidate | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of this.candidates.values()) {
      if (!this.isEntryMatch(entry, candidate)) {
        continue;
      }

      const distance = Math.abs(getPerformanceEntryStartedAt(entry) - candidate.startedAt);
      if (distance < closestDistance) {
        closestCandidate = candidate;
        closestDistance = distance;
      }
    }

    return closestCandidate;
  }

  private isEntryMatch(entry: SupportedPerformanceEntry, candidate: WrapperRequestCandidate): boolean {
    if (candidate.matched || entry.entryType !== "resource") {
      return false;
    }

    const initiatorType = getPerformanceEntryInitiatorType(entry);
    if (initiatorType !== candidate.initiatorType || !candidate.urls.has(toAbsoluteUrl(entry.name))) {
      return false;
    }

    return Math.abs(getPerformanceEntryStartedAt(entry) - candidate.startedAt) <= MATCH_TOLERANCE_MS;
  }

  private claimEntry(observedEntry: ObservedPerformanceEntry, candidate: WrapperRequestCandidate): void {
    observedEntry.claimed = true;
    candidate.matched = true;
    if (observedEntry.timeoutId !== undefined) {
      window.clearTimeout(observedEntry.timeoutId);
    }

    this.pendingRequests.addPerformance(
      candidate.requestId,
      getPerformanceEntryTiming(observedEntry.entry),
      getPerformanceEntrySizes(observedEntry.entry)
    );
    this.observedEntries.delete(observedEntry.key);

    if (candidate.completedAt !== undefined) {
      this.finishCandidate(candidate);
    }
  }

  private finishCandidate(candidate: WrapperRequestCandidate): void {
    if (candidate.timeoutId !== undefined) {
      window.clearTimeout(candidate.timeoutId);
      candidate.timeoutId = undefined;
    }

    this.candidates.delete(candidate.requestId);
    candidate.resolve?.();
    candidate.resolve = undefined;
  }

  private emitStandaloneEntry(observedEntry: ObservedPerformanceEntry): void {
    if (observedEntry.claimed) {
      return;
    }

    observedEntry.claimed = true;
    if (observedEntry.timeoutId !== undefined) {
      window.clearTimeout(observedEntry.timeoutId);
    }
    this.observedEntries.delete(observedEntry.key);

    const entry = observedEntry.entry;
    const status = getPerformanceEntryStatus(entry);
    const request: CapturedNetworkRequest = {
      schemaVersion: 1,
      requestId: createRequestId(),
      currentUrl: getCurrentUrl(),
      url: toAbsoluteUrl(entry.name),
      method: "GET",
      initiatorType: getPerformanceEntryInitiatorType(entry),
      startedAt: getPerformanceEntryStartedAt(entry),
      completedAt: getPerformanceEntryCompletedAt(entry),
      durationMs: entry.duration,
      status,
      outcome: status !== undefined && status >= 400 ? "http_error" : "success",
      requestHeaders: {},
      responseHeaders: {},
      timing: getPerformanceEntryTiming(entry),
      sizes: getPerformanceEntrySizes(entry),
      performanceEntryFound: true,
    };

    try {
      this.emit(request);
    } catch {
      return;
    }
  }
}

function createPerformanceEntryKey(entry: SupportedPerformanceEntry): string {
  return [entry.entryType, entry.name, entry.startTime, entry.duration, getPerformanceEntryInitiatorType(entry)].join(
    "|"
  );
}
