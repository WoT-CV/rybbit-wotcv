import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplayEventLike } from "../../network/types";
import { useReplayStore } from "../../replayStore";

const mocks = vi.hoisted(() => ({
  players: [] as Array<{
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    playing: boolean;
    timeHandler?: (time: number) => void;
  }>,
}));

vi.mock("../ReplayPlayerAdapter", () => ({
  ReplayPlayerAdapter: class {
    playing = false;
    play = vi.fn(() => {
      this.playing = true;
    });
    pause = vi.fn(() => {
      this.playing = false;
    });
    destroy = vi.fn();
    timeHandler?: (time: number) => void;
    constructor() {
      mocks.players.push(this);
    }
    getDuration() {
      return 10000;
    }
    getIsPlaying() {
      return this.playing;
    }
    seek() {}
    resize() {}
    onCurrentTime(handler: (time: number) => void) {
      this.timeHandler = handler;
    }
    onPlayingChange() {}
    onDuration() {}
  },
}));

import { useReplayPlayer } from "./useReplayPlayer";

function Harness({ data }: { data: { events: ReplayEventLike[] } }) {
  const { playerContainerRef } = useReplayPlayer({ data, width: 390, height: 700 });
  return <div ref={playerContainerRef} />;
}

describe("useReplayPlayer lifecycle", () => {
  beforeEach(() => {
    mocks.players.length = 0;
    useReplayStore.setState({ ...useReplayStore.getInitialState(), sessionId: "test-replay" });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not reconstruct the recording when only the query wrapper changes", () => {
    const events: ReplayEventLike[] = [];
    const view = render(<Harness data={{ events }} />);
    view.rerender(<Harness data={{ events }} />);
    expect(mocks.players).toHaveLength(1);
    view.unmount();
    expect(mocks.players[0].destroy).toHaveBeenCalledOnce();
  });

  it("ignores playback clock updates during an unfinished seek", () => {
    render(<Harness data={{ events: [] }} />);
    act(() => {
      useReplayStore.setState({ playbackState: "seeking", currentTime: 7000 });
      mocks.players[0].timeHandler?.(1000);
    });
    expect(useReplayStore.getState().currentTime).toBe(7000);
  });

  it("pauses background playback and resumes only a previously playing recording", () => {
    render(<Harness data={{ events: [] }} />);
    const player = mocks.players[0];
    player.playing = true;
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(player.pause).toHaveBeenCalledOnce();
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(player.play).toHaveBeenCalledOnce();
    player.playing = false;
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(player.play).toHaveBeenCalledOnce();
  });

  it("releases a partially initialized player if observer setup fails", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor() {
          throw new Error("observer failure");
        }
      }
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const removeListener = vi.spyOn(document, "removeEventListener");
    render(<Harness data={{ events: [] }} />);
    await act(async () => {});
    expect(error).toHaveBeenCalled();
    expect(mocks.players[0].destroy).toHaveBeenCalledOnce();
    expect(useReplayStore.getState().player).toBeNull();
    expect(removeListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
