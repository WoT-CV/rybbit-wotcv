import { useCallback, useRef } from "react";

import { useReplayStore } from "../../replayStore";

export function useReplaySeek() {
  const wasPlayingBeforePreviewRef = useRef<boolean | null>(null);

  const seekTo = useCallback((offset: number, shouldPlay?: boolean) => {
    const state = useReplayStore.getState();
    const player = state.player;
    if (!player) return;

    const resumePlayback = shouldPlay ?? state.isPlaying;
    const safeOffset = Math.max(0, Math.min(state.duration, offset));

    player.pause();
    state.setPlaybackState("seeking");
    player.seek(safeOffset);
    state.setCurrentTime(safeOffset);
    state.markSeek();

    if (resumePlayback) {
      player.play();
      state.setIsPlaying(true);
      state.setPlaybackState("playing");
    } else {
      state.setIsPlaying(false);
      state.setPlaybackState("paused");
    }
  }, []);

  const previewSeek = useCallback((offset: number) => {
    const state = useReplayStore.getState();
    if (!state.player) return;

    if (wasPlayingBeforePreviewRef.current === null) {
      wasPlayingBeforePreviewRef.current = state.isPlaying;
      state.player.pause();
      state.setIsPlaying(false);
      state.setPlaybackState("seeking");
    }

    const safeOffset = Math.max(0, Math.min(state.duration, offset));
    state.player.seek(safeOffset);
    state.setCurrentTime(safeOffset);
  }, []);

  const commitPreviewSeek = useCallback(
    (offset: number) => {
      const shouldPlay = wasPlayingBeforePreviewRef.current ?? useReplayStore.getState().isPlaying;
      wasPlayingBeforePreviewRef.current = null;
      seekTo(offset, shouldPlay);
    },
    [seekTo]
  );

  return { commitPreviewSeek, previewSeek, seekTo };
}
