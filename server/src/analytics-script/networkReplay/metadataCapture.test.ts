import {
  DEFAULT_NETWORK_REPLAY_CONFIG,
  toMetadataRequest as sharedMetadataProjector,
  type CapturedNetworkRequest,
} from "@rybbit/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeNetworkReplayConfig } from "./config.js";
import { startNetworkReplayRecorder } from "./index.js";
import { sanitizeNetworkUrl, toMetadataRequest } from "./metadataCapture.js";

const metadataConfig = {
  ...DEFAULT_NETWORK_REPLAY_CONFIG,
  enabled: true,
  captureMode: "metadata" as const,
  capturePerformanceResources: false,
};
const location = { href: "https://app.example.com/page?secret=page-secret#private" };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("metadata capture policy", () => {
  it("uses exactly the shared projector tested by the independently built replay client", () => {
    expect(toMetadataRequest).toBe(sharedMetadataProjector);
  });

  it("caps stale flags but preserves enabled/disabled and legacy modes", () => {
    expect(normalizeNetworkReplayConfig(metadataConfig)).toMatchObject({
      enabled: true,
      captureRequestBody: false,
      captureResponseBody: false,
      captureRequestHeaders: false,
      captureResponseHeaders: false,
    });
    expect(normalizeNetworkReplayConfig({ ...metadataConfig, enabled: false }).enabled).toBe(false);
    expect(normalizeNetworkReplayConfig({ enabled: true }).captureRequestBody).toBe(true);
    expect(normalizeNetworkReplayConfig({ enabled: true, captureMode: "typo" }).captureResponseBody).toBe(false);
  });
  it.each([
    "data:text/plain,secret",
    "blob:https://api.example.com/secret",
    "invalid",
    "//user:secret@api.example.com",
  ])("redacts non-HTTP or invalid URL %s", value => {
    expect(sanitizeNetworkUrl(value)).toBe("[redacted]");
  });
  it("strips credentials, search, fragment and bounds excessive paths", () => {
    expect(sanitizeNetworkUrl("https://user:pass@api.example.com/a?token=secret#secret")).toBe(
      "https://api.example.com/a"
    );
    expect(sanitizeNetworkUrl(`https://api.example.com/${"a".repeat(2049)}?secret=1`)).toBe(
      "https://api.example.com/[redacted]"
    );
  });
  it("uses a final allowlist including Resource Timing and unload, without mutating source data", () => {
    const request: CapturedNetworkRequest = {
      schemaVersion: 1,
      requestId: "r",
      currentUrl: location.href,
      url: "https://api.example.com/r?secret=1",
      method: "POST",
      initiatorType: "resource",
      startedAt: 100,
      outcome: "pending_on_unload",
      requestHeaders: { authorization: "secret" },
      responseHeaders: { cookie: "secret" },
      requestBody: { kind: "text", value: "secret" },
      responseBody: { kind: "text", value: "secret" },
      statusText: "secret",
      error: { name: "secret", message: "secret", stack: "secret" },
      correlationId: "c",
      performanceEntryFound: true,
      timing: { duration: 15 },
      sizes: { transferSize: 42 },
    };
    const result = toMetadataRequest(request);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result).toMatchObject({
      captureMode: "metadata",
      correlationId: "c",
      outcome: "pending_on_unload",
      timing: { duration: 15 },
      sizes: { transferSize: 42 },
    });
    expect(request.requestBody?.value).toBe("secret");
    expect(result.requestBody).toBeUndefined();
    expect(result.bodyCaptureCompletedAt).toBeUndefined();
  });
  it("does not construct or clone Requests, clone Responses, or consume large bodies", async () => {
    const input = new Request("https://api.example.com/upload?secret=1", {
      method: "POST",
      body: "secret".repeat(400000),
    });
    const response = new Response("secret".repeat(400000), {
      headers: { "x-correlation-id": "c1", authorization: "secret" },
    });
    const requestClone = vi.spyOn(Request.prototype, "clone");
    const responseClone = vi.spyOn(Response.prototype, "clone");
    const requestText = vi.spyOn(Request.prototype, "text");
    const responseText = vi.spyOn(Response.prototype, "text");
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("window", { fetch, location });
    const records: CapturedNetworkRequest[] = [];
    const stop = startNetworkReplayRecorder({
      analyticsHost: "https://tracking.example.com",
      config: metadataConfig,
      emit: request => records.push(request),
    });
    try {
      expect(await window.fetch(input)).toBe(response);
      await vi.waitFor(() => expect(records).toHaveLength(1));
      expect(fetch).toHaveBeenCalledExactlyOnceWith(input, undefined);
      expect(requestClone).not.toHaveBeenCalled();
      expect(responseClone).not.toHaveBeenCalled();
      expect(requestText).not.toHaveBeenCalled();
      expect(responseText).not.toHaveBeenCalled();
      expect(input.bodyUsed).toBe(false);
      expect(response.bodyUsed).toBe(false);
      expect(records[0]).toMatchObject({
        method: "POST",
        captureMode: "metadata",
        correlationId: "c1",
        url: "https://api.example.com/upload",
        currentUrl: "https://app.example.com/page",
      });
      expect(JSON.stringify(records)).not.toContain("secret");
      expect(JSON.stringify(records).length).toBeLessThan(1000);
    } finally {
      stop();
    }
    expect(window.fetch).toBe(fetch);
  });
  it("preserves application rejection identity while omitting sensitive diagnostic strings", async () => {
    const error = new Error("network failed: ?token=secret");
    vi.stubGlobal("window", { fetch: vi.fn().mockRejectedValue(error), location });
    const records: CapturedNetworkRequest[] = [];
    const stop = startNetworkReplayRecorder({
      analyticsHost: "https://tracking.example.com",
      config: metadataConfig,
      emit: request => records.push(request),
    });
    try {
      await expect(window.fetch("https://api.example.com/a")).rejects.toBe(error);
      await vi.waitFor(() => expect(records).toHaveLength(1));
      expect(records[0]).toMatchObject({ outcome: "network_error", error: { name: "NetworkError" } });
      expect(JSON.stringify(records)).not.toContain("secret");
    } finally {
      stop();
    }
  });
  it("never wraps fetch when replay is disabled", () => {
    const fetch = vi.fn();
    vi.stubGlobal("window", { fetch, location });
    const stop = startNetworkReplayRecorder({
      analyticsHost: "https://tracking.example.com",
      config: { ...metadataConfig, enabled: false },
      emit: vi.fn(),
    });
    expect(window.fetch).toBe(fetch);
    stop();
  });
  it("sanitizes standalone navigation and resource entries through the recorder emission path", () => {
    const callbacks: Array<(list: { getEntries(): PerformanceEntry[] }) => void> = [];
    class FakePerformanceObserver {
      static supportedEntryTypes = ["resource", "navigation"];
      constructor(callback: (list: { getEntries(): PerformanceEntry[] }) => void) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("PerformanceObserver", FakePerformanceObserver);
    vi.stubGlobal("window", { location, setTimeout, clearTimeout });
    const records: CapturedNetworkRequest[] = [];
    const stop = startNetworkReplayRecorder({
      analyticsHost: "https://tracking.example.com",
      config: {
        ...metadataConfig,
        capturePerformanceResources: true,
        captureInitialPerformanceResources: false,
        captureFetch: false,
        captureXhr: false,
      },
      emit: request => records.push(request),
    });
    callbacks[1]({
      getEntries: () => [
        {
          name: location.href,
          entryType: "navigation",
          startTime: 0,
          duration: 15,
          responseEnd: 15,
          toJSON: () => ({}),
        } as PerformanceEntry,
      ],
    });
    callbacks[0]({
      getEntries: () => [
        {
          name: "https://user:secret@cdn.example.com/a.js?signature=secret#private",
          entryType: "resource",
          startTime: 1,
          duration: 15,
          responseEnd: 16,
          initiatorType: "script",
        } as PerformanceResourceTiming,
      ],
    });
    stop(); // flushes unclaimed resource entries as well
    expect(records).toHaveLength(2);
    expect(records.map(request => request.url)).toEqual([
      "https://app.example.com/page",
      "https://cdn.example.com/a.js",
    ]);
    expect(records.every(request => request.captureMode === "metadata")).toBe(true);
    expect(JSON.stringify(records)).not.toContain("secret");
  });
  it("XHR does not enumerate headers or read any response body in metadata mode", async () => {
    const enumerateHeaders = vi.fn(() => {
      throw new Error("must not read");
    });
    const readBody = vi.fn(() => {
      throw new Error("must not read");
    });
    class FakeXhr extends EventTarget {
      status = 200;
      statusText = "OK";
      responseURL = "https://api.example.com/a?secret=1";
      get response() {
        return readBody();
      }
      get responseText() {
        return readBody();
      }
      open() {}
      setRequestHeader() {}
      getAllResponseHeaders = enumerateHeaders;
      getResponseHeader(name: string) {
        return name === "x-correlation-id" ? "xhr-id" : null;
      }
      send() {
        this.dispatchEvent(new Event("loadend"));
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    vi.stubGlobal("window", { location });
    const records: CapturedNetworkRequest[] = [];
    const stop = startNetworkReplayRecorder({
      analyticsHost: "https://tracking.example.com",
      config: metadataConfig,
      emit: request => records.push(request),
    });
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://api.example.com/a?secret=1");
      xhr.setRequestHeader("Authorization", "secret");
      xhr.send("secret");
      await vi.waitFor(() => expect(records).toHaveLength(1));
      expect(records[0]).toMatchObject({
        correlationId: "xhr-id",
        captureMode: "metadata",
        url: "https://api.example.com/a",
      });
      expect(enumerateHeaders).not.toHaveBeenCalled();
      expect(readBody).not.toHaveBeenCalled();
      expect(JSON.stringify(records)).not.toContain("secret");
    } finally {
      stop();
    }
  });
});
