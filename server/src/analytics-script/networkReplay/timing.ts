import type { CapturedNetworkSizes, CapturedNetworkTiming } from "./types.js";

export type SupportedPerformanceEntry = PerformanceResourceTiming | PerformanceNavigationTiming;

export function getPerformanceEntryStartedAt(entry: SupportedPerformanceEntry): number {
  return getTimeOrigin() + entry.startTime;
}

export function getPerformanceEntryCompletedAt(entry: SupportedPerformanceEntry): number {
  const responseEnd = entry.responseEnd > 0 ? entry.responseEnd : entry.startTime + entry.duration;
  return getTimeOrigin() + responseEnd;
}

export function getPerformanceEntryTiming(entry: SupportedPerformanceEntry): CapturedNetworkTiming {
  return {
    startTime: entry.startTime,
    fetchStart: entry.fetchStart,
    domainLookupStart: entry.domainLookupStart,
    domainLookupEnd: entry.domainLookupEnd,
    connectStart: entry.connectStart,
    secureConnectionStart: entry.secureConnectionStart,
    connectEnd: entry.connectEnd,
    requestStart: entry.requestStart,
    responseStart: entry.responseStart,
    responseEnd: entry.responseEnd,
    duration: entry.duration,
  };
}

export function getPerformanceEntrySizes(entry: SupportedPerformanceEntry): CapturedNetworkSizes | undefined {
  const resourceEntry = entry as PerformanceResourceTiming;
  if (
    resourceEntry.transferSize === undefined &&
    resourceEntry.encodedBodySize === undefined &&
    resourceEntry.decodedBodySize === undefined
  ) {
    return undefined;
  }

  return {
    transferSize: resourceEntry.transferSize,
    encodedBodySize: resourceEntry.encodedBodySize,
    decodedBodySize: resourceEntry.decodedBodySize,
  };
}

export function getPerformanceEntryStatus(entry: SupportedPerformanceEntry): number | undefined {
  const responseStatus = (entry as SupportedPerformanceEntry & { responseStatus?: number }).responseStatus;
  return typeof responseStatus === "number" && responseStatus > 0 ? responseStatus : undefined;
}

export function getPerformanceEntryInitiatorType(entry: SupportedPerformanceEntry): string {
  return entry.entryType === "navigation" ? "navigation" : entry.initiatorType || "resource";
}

export function isSupportedPerformanceEntry(entry: PerformanceEntry): entry is SupportedPerformanceEntry {
  return entry.entryType === "resource" || entry.entryType === "navigation";
}

function getTimeOrigin(): number {
  if (typeof performance.timeOrigin === "number" && performance.timeOrigin > 0) {
    return performance.timeOrigin;
  }

  return Date.now() - performance.now();
}
