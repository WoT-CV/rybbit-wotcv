// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useReplayStore } from "../../replayStore";
import type { ReplayPlayerAdapter } from "../ReplayPlayerAdapter";
import { useSkipInactivity } from "./useSkipInactivity";

function mockPlayer() {
  return { setSpeed: vi.fn() } as unknown as ReplayPlayerAdapter;
}

beforeEach(() => {
  useReplayStore.setState({
    ...useReplayStore.getInitialState(),
    isPlaying: true,
    duration: 20_000,
    replaySegments: [
      { start: 0, end: 5_000, duration: 5_000, isActive: true, kind: "active", eventCount: 1 },
      { start: 5_000, end: 15_000, duration: 10_000, isActive: false, kind: "inactive", eventCount: 0 },
      { start: 15_000, end: 20_000, duration: 5_000, isActive: true, kind: "active", eventCount: 1 },
    ],
  });
});

afterEach(cleanup);

describe("useSkipInactivity clock subscription", () => {
  it("keeps per-frame boundary precision without per-frame React renders", () => {
    const player = mockPlayer();
    const render = vi.fn();
    renderHook(() => {
      render();
      useSkipInactivity({ player });
    });
    render.mockClear();
    vi.mocked(player.setSpeed).mockClear();

    for (let frame = 1; frame <= 120; frame++) {
      act(() => useReplayStore.getState().setCurrentTime(frame * 16));
    }
    expect(render).not.toHaveBeenCalled();
    expect(player.setSpeed).not.toHaveBeenCalled();

    act(() => useReplayStore.getState().setCurrentTime(5_001));
    expect(player.setSpeed).toHaveBeenLastCalledWith(25);
    expect(useReplayStore.getState().playbackState).toBe("skipping-inactivity");
    vi.mocked(player.setSpeed).mockClear();
    act(() => useReplayStore.getState().setCurrentTime(14_999));
    expect(player.setSpeed).not.toHaveBeenCalled();
    act(() => useReplayStore.getState().setCurrentTime(15_001));
    expect(player.setSpeed).toHaveBeenLastCalledWith(1);
    expect(useReplayStore.getState().isSkippingInactivity).toBe(false);
    act(() => useReplayStore.getState().setCurrentTime(6_000));
    expect(player.setSpeed).toHaveBeenLastCalledWith(25);
    // A committed seek can remain in the same inactive segment. Restore the
    // mode after seekTo marks the transition as "playing" without a speed change.
    act(() => useReplayStore.setState({ currentTime: 7_000, playbackState: "playing", seekRevision: 1 }));
    expect(useReplayStore.getState().playbackState).toBe("skipping-inactivity");
  });

  it("applies viewer speed changes, pause, resume, disabling skip and the end", () => {
    const player = mockPlayer();
    renderHook(() => useSkipInactivity({ player }));
    act(() => useReplayStore.setState({ currentTime: 6_000, playbackSpeed: "2", skipInactivitySpeed: 50 }));
    expect(player.setSpeed).toHaveBeenLastCalledWith(50);
    act(() => useReplayStore.getState().setIsPlaying(false));
    expect(player.setSpeed).toHaveBeenLastCalledWith(2);
    expect(useReplayStore.getState().playbackState).toBe("paused");
    act(() => useReplayStore.getState().setIsPlaying(true));
    expect(player.setSpeed).toHaveBeenLastCalledWith(50);
    act(() => useReplayStore.getState().setSkipInactivityEnabled(false));
    expect(player.setSpeed).toHaveBeenLastCalledWith(2);
    act(() => useReplayStore.setState({ currentTime: 20_000, isPlaying: false }));
    expect(useReplayStore.getState().playbackState).toBe("ended");
  });

  it("does not overwrite a seek preview and applies speed to a replacement player", () => {
    const player = mockPlayer();
    const view = renderHook(({ activePlayer }) => useSkipInactivity({ player: activePlayer }), {
      initialProps: { activePlayer: player },
    });
    act(() => useReplayStore.setState({ currentTime: 6_000, isPlaying: false, playbackState: "seeking" }));
    expect(useReplayStore.getState().playbackState).toBe("seeking");
    act(() => useReplayStore.setState({ currentTime: 6_000, isPlaying: true, playbackState: "playing" }));
    expect(player.setSpeed).toHaveBeenLastCalledWith(25);
    const replacement = mockPlayer();
    view.rerender({ activePlayer: replacement });
    expect(replacement.setSpeed).toHaveBeenCalledExactlyOnceWith(25);
    view.unmount();
    act(() => useReplayStore.getState().setCurrentTime(16_000));
    expect(replacement.setSpeed).toHaveBeenCalledOnce();
  });
});
