// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetSessionReplayEventsResponse } from "@/api/analytics/endpoints/sessionReplay";
import { useReplayStore } from "../replayStore";
import { ReplayPlayerTopbar } from "./ReplayPlayerTopbar";

const mocks = vi.hoisted(() => ({ getReplay: vi.fn(), icon: vi.fn(() => null) }));

vi.mock("next/navigation", () => ({ useParams: () => ({ site: "2" }) }));
vi.mock("@/api/analytics/hooks/sessionReplay/useGetSessionReplayEvents", () => ({
  useGetSessionReplayEvents: mocks.getReplay,
}));
vi.mock("@/components/TooltipIcons/TooltipIcons", () => ({
  BrowserTooltipIcon: mocks.icon,
  CountryFlagTooltipIcon: mocks.icon,
  DeviceTypeTooltipIcon: mocks.icon,
  OperatingSystemTooltipIcon: mocks.icon,
}));

const data: GetSessionReplayEventsResponse = {
  events: [
    { type: 4, timestamp: 1_000, data: { href: "https://example.com/first" } },
    { type: 4, timestamp: 6_000, data: { href: "https://example.com/second" } },
  ],
  metadata: {
    session_id: "test-replay",
    user_id: "test-user",
    identified_user_id: "",
    traits: null,
    start_time: "2026-01-01 00:00:00",
    event_count: 2,
    compressed_size_bytes: 0,
    page_url: "https://example.com/first",
    user_agent: "",
    country: "PL",
    region: "",
    city: "",
    lat: 0,
    lon: 0,
    browser: "Safari",
    browser_version: "",
    operating_system: "iOS",
    operating_system_version: "",
    language: "en",
    screen_width: 1920,
    screen_height: 1080,
    device_type: "desktop",
    channel: "Direct",
    hostname: "example.com",
    referrer: "",
    has_replay_data: true,
    created_at: new Date("2026-01-01"),
  },
};

beforeEach(() => {
  useReplayStore.setState({ ...useReplayStore.getInitialState(), sessionId: "test-replay" });
  mocks.getReplay.mockReset().mockReturnValue({ data });
  mocks.icon.mockClear();
});
afterEach(cleanup);

describe("ReplayPlayerTopbar clock subscription", () => {
  it("does not re-render its query and tooltips until the replay URL changes", () => {
    const view = render(<ReplayPlayerTopbar />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://example.com/first");
    mocks.getReplay.mockClear();
    mocks.icon.mockClear();
    for (let frame = 1; frame <= 120; frame++) {
      act(() => useReplayStore.getState().setCurrentTime(frame * 16));
      view.rerender(<ReplayPlayerTopbar />);
    }
    expect(mocks.getReplay).not.toHaveBeenCalled();
    expect(mocks.icon).not.toHaveBeenCalled();

    act(() => useReplayStore.getState().setCurrentTime(5_000));
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://example.com/second");
    act(() => useReplayStore.getState().setCurrentTime(4_999));
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://example.com/first");
  });

  it("uses the new recording after switching sessions", () => {
    render(<ReplayPlayerTopbar />);
    mocks.getReplay.mockReturnValue({
      data: { ...data, events: [], metadata: { ...data.metadata, page_url: "https://example.com/new-session" } },
    });
    act(() => useReplayStore.getState().selectSession("new-session", false));
    expect(mocks.getReplay).toHaveBeenLastCalledWith(2, "new-session");
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://example.com/new-session");
  });
});
