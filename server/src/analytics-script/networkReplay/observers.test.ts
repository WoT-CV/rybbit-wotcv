import { DEFAULT_NETWORK_REPLAY_CONFIG, type CapturedNetworkRequest } from "@rybbit/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { observeFetch } from "./fetchObserver.js";
import { observeXhr } from "./xhrObserver.js";
import { PendingRequests } from "./pendingRequests.js";

const config = {
  ...DEFAULT_NETWORK_REPLAY_CONFIG,
  captureRequestHeaders: false,
  captureResponseHeaders: false,
  captureRequestBody: false,
  captureResponseBody: false,
};
const page = { href: "https://app.example.com/page" };
afterEach(() => vi.unstubAllGlobals());

describe("network observer correlation", () => {
  it("fetch preserves response identity and correlation with headers and bodies disabled", async () => {
    const records: CapturedNetworkRequest[] = [];
    const response = new Response("payload", { headers: { "x-correlation-id": "request-123" } });
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("window", { fetch, location: page });
    const stop = observeFetch({
      analyticsHost: "https://tracking.example.com",
      config,
      pendingRequests: new PendingRequests(request => records.push(request)),
    });
    try {
      expect(await window.fetch("https://api.example.com/a")).toBe(response);
      await vi.waitFor(() => expect(records).toHaveLength(1));
      expect(records[0]).toMatchObject({ correlationId: "request-123", requestHeaders: {}, responseHeaders: {} });
      expect(records[0].responseBody).toBeUndefined();
      expect(await response.text()).toBe("payload");
    } finally {
      stop();
    }
    expect(window.fetch).toBe(fetch);
  });
  it("XHR captures correlation independently of the response header payload", async () => {
    class FakeXhr extends EventTarget {
      status = 200;
      statusText = "OK";
      responseURL = "https://api.example.com/a";
      open() {}
      setRequestHeader() {}
      getAllResponseHeaders() {
        return "x-correlation-id: request-456\r\n";
      }
      getResponseHeader(name: string) {
        return name === "x-correlation-id" ? "request-456" : null;
      }
      send() {
        this.dispatchEvent(new Event("loadend"));
      }
    }
    const records: CapturedNetworkRequest[] = [];
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    vi.stubGlobal("window", { location: page });
    const stop = observeXhr({
      analyticsHost: "https://tracking.example.com",
      config,
      pendingRequests: new PendingRequests(request => records.push(request)),
    });
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "https://api.example.com/a");
      xhr.send();
      await vi.waitFor(() => expect(records).toHaveLength(1));
      expect(records[0]).toMatchObject({ correlationId: "request-456", responseHeaders: {} });
    } finally {
      stop();
    }
  });
});
