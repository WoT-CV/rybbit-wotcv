import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import type { ReplayEventLike } from "../../network/types";
import { useReplayStore } from "../../replayStore";
import { ReplayPlayerAdapter } from "../ReplayPlayerAdapter";

interface UseReplayPlayerProps {
  data: { events: ReplayEventLike[] } | undefined;
  width: number;
  height: number;
}

export const useReplayPlayer = ({ data, width, height }: UseReplayPlayerProps) => {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReplayPlayerAdapter | null>(null);
  const { setPlayer, setCurrentTime, setIsPlaying, setDuration } = useReplayStore(
    useShallow(state => ({
      setPlayer: state.setPlayer,
      setCurrentTime: state.setCurrentTime,
      setIsPlaying: state.setIsPlaying,
      setDuration: state.setDuration,
    }))
  );

  const widthRef = useRef(width);
  const heightRef = useRef(height);

  useEffect(() => {
    widthRef.current = width;
    heightRef.current = height;
  }, [height, width]);

  useEffect(() => {
    const target = playerContainerRef.current;
    if (!data?.events || !target) return;

    const initializedState = useReplayStore.getState();
    const initializedSessionId = initializedState.sessionId;
    const initializedSelectionVersion = initializedState.selectionVersion;
    let handleVisibilityChange: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let adapter: ReplayPlayerAdapter;

    target.replaceChildren();

    try {
      const initialRect = target.getBoundingClientRect();
      adapter = new ReplayPlayerAdapter({
        target,
        events: data.events,
        width: initialRect.width || widthRef.current,
        height: initialRect.height || heightRef.current,
      });

      playerRef.current = adapter;
      setPlayer(adapter);

      adapter.onCurrentTime(currentTime => {
        const playerDuration = adapter.getDuration();
        if (playerDuration && currentTime > playerDuration) {
          adapter.pause();
          setCurrentTime(playerDuration);
          setIsPlaying(false);
        } else {
          setCurrentTime(currentTime);
        }
      });

      adapter.onPlayingChange(isNowPlaying => {
        setIsPlaying(isNowPlaying);
        if (!isNowPlaying) return;

        const state = useReplayStore.getState();
        if (
          state.sessionId === initializedSessionId &&
          state.autoplayRequest?.sessionId === initializedSessionId &&
          state.autoplayRequest.selectionVersion === initializedSelectionVersion &&
          state.player === adapter
        ) {
          state.setPlaybackState("playing");
          state.consumeAutoplay(state.autoplayRequest);
        }
      });

      const syncDurationAndAutoplay = () => {
        const playerDuration = adapter.getDuration();
        if (playerDuration) setDuration(playerDuration);

        const state = useReplayStore.getState();
        if (
          state.sessionId === initializedSessionId &&
          state.autoplayRequest?.sessionId === initializedSessionId &&
          state.autoplayRequest.selectionVersion === initializedSelectionVersion &&
          state.player === adapter
        ) {
          adapter.play();
        }
      };

      adapter.onDuration(playerDuration => {
        setDuration(playerDuration);
        syncDurationAndAutoplay();
      });
      queueMicrotask(syncDurationAndAutoplay);

      let wasPlayingBeforeHidden = false;
      handleVisibilityChange = () => {
        if (document.hidden) {
          wasPlayingBeforeHidden = adapter.getIsPlaying();
          if (wasPlayingBeforeHidden) {
            adapter.pause();
            setIsPlaying(false);
          }
          return;
        }

        if (wasPlayingBeforeHidden) {
          const playerDuration = adapter.getDuration();
          if (playerDuration) setDuration(playerDuration);
          adapter.play();
          setIsPlaying(true);
          wasPlayingBeforeHidden = false;
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      resizeObserver = new ResizeObserver(entries => {
        const entry = entries[0];
        if (!entry || entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return;
        adapter.resize(entry.contentRect.width, entry.contentRect.height);
      });
      resizeObserver.observe(target);
    } catch (error) {
      console.error("Failed to initialize rrweb player:", error);
      return;
    }

    return () => {
      if (handleVisibilityChange) document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver?.disconnect();
      adapter.destroy();
      playerRef.current = null;
      setPlayer(null);
    };
  }, [data, setCurrentTime, setDuration, setIsPlaying, setPlayer]);

  useEffect(() => {
    const target = playerContainerRef.current;
    const rect = target?.getBoundingClientRect();
    playerRef.current?.resize(rect?.width || width, rect?.height || height);
  }, [height, width]);

  return { playerContainerRef };
};
