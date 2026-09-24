// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as networkEventUtils from "./networkEventUtils";
import { NetworkWaterfall } from "./NetworkWaterfall";
import type { ParsedNetworkRequest } from "./types";

vi.mock("next-intl", () => ({ useExtracted: () => (message: string) => message }));

function request(index: number, overrides: Partial<ParsedNetworkRequest> = {}): ParsedNetworkRequest {
  return {
    completedAt: 11_100 + index * 200,
    currentUrl: "https://example.com/",
    durationMs: 100,
    endOffset: 10_100 + index * 200,
    host: "example.com",
    initiatorType: "fetch",
    method: "GET",
    outcome: "success",
    performanceEntryFound: false,
    requestHeaders: {},
    requestId: `request-${index}`,
    responseHeaders: {},
    schemaVersion: 1,
    searchText: `request ${index}`,
    startOffset: 10_000 + index * 200,
    startedAt: 11_000 + index * 200,
    status: 200,
    url: `https://example.com/request-${index}`,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NetworkWaterfall playback updates", () => {
  it("does not rebuild hundreds of unchanged bars on every animation frame", () => {
    const formatUrl = vi.spyOn(networkEventUtils, "getRequestDisplayUrl");
    const requests = Array.from({ length: 917 }, (_, index) => request(index));
    const props = { requests, duration: 200_000, onSeek: vi.fn() };
    const view = render(<NetworkWaterfall {...props} currentTime={0} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeLessThanOrEqual(500);
    expect(formatUrl).toHaveBeenCalledTimes(buttons.length);
    formatUrl.mockClear();

    for (let frame = 1; frame <= 120; frame++) {
      view.rerender(<NetworkWaterfall {...props} currentTime={frame * 16} />);
    }

    expect(formatUrl).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button")[0]).toBe(buttons[0]);
  });

  it("updates active bars immediately in both directions and seeks to their start", () => {
    const requests = [request(0), request(1)];
    const onSeek = vi.fn();
    const props = { requests, duration: 20_000, onSeek };
    const view = render(<NetworkWaterfall {...props} currentTime={0} />);
    const bar = screen.getByRole("button", { name: "GET /request-0, 100 ms" });
    expect(bar.className).toContain("opacity-75");

    view.rerender(<NetworkWaterfall {...props} currentTime={10_050} />);
    expect(bar.className).toContain("opacity-100");
    view.rerender(<NetworkWaterfall {...props} currentTime={10_101} />);
    expect(bar.className).toContain("opacity-75");
    view.rerender(<NetworkWaterfall {...props} currentTime={10_100} />);
    expect(bar.className).toContain("opacity-100");
    fireEvent.click(bar);
    expect(onSeek).toHaveBeenCalledWith(10_000);

    view.rerender(<NetworkWaterfall {...props} duration={40_000} currentTime={10_100} />);
    expect(bar.style.left).toBe("25%");
    const nextSeek = vi.fn();
    view.rerender(<NetworkWaterfall {...props} onSeek={nextSeek} currentTime={10_100} />);
    fireEvent.click(bar);
    expect(nextSeek).toHaveBeenCalledWith(10_000);
  });

  it("retains errors and requests that become active outside the sampled bars", () => {
    const requests = Array.from({ length: 917 }, (_, index) => request(index));
    requests[915] = request(915, { status: 500 });
    const props = { requests, duration: 200_000, onSeek: vi.fn() };
    const view = render(<NetworkWaterfall {...props} currentTime={0} />);
    expect(screen.getByRole("button", { name: "GET /request-915, 100 ms" }).className).toContain("bg-red-500");
    expect(screen.queryByRole("button", { name: "GET /request-1, 100 ms" })).toBeNull();

    view.rerender(<NetworkWaterfall {...props} currentTime={10_250} />);
    expect(screen.getByRole("button", { name: "GET /request-1, 100 ms" }).className).toContain("opacity-100");
    expect(screen.getAllByRole("button").length).toBeLessThanOrEqual(500);
  });

  it("refreshes labels and geometry when a recording replaces the request objects", () => {
    const props = { duration: 20_000, currentTime: 0, onSeek: vi.fn() };
    const view = render(<NetworkWaterfall {...props} requests={[request(0)]} />);
    const replaced = request(0, { url: "https://example.com/replaced", startOffset: 5_000 });
    view.rerender(<NetworkWaterfall {...props} requests={[replaced]} />);
    expect(screen.getByRole("button", { name: "GET /replaced, 100 ms" }).style.left).toBe("25%");
    expect(screen.queryByRole("button", { name: "GET /request-0, 100 ms" })).toBeNull();
  });
});
