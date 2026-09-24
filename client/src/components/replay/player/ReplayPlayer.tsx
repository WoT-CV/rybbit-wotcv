import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import "rrweb-player/dist/style.css";
import { useShallow } from "zustand/react/shallow";

import { useGetSessionReplayEvents } from "@/api/analytics/hooks/sessionReplay/useGetSessionReplayEvents";
import { ThreeDotLoader } from "@/components/Loaders";
import { ReplayDrawer } from "@/components/Sessions/ReplayDrawer";

import { useReplayStore } from "../replayStore";
import { useActivityPeriods } from "./hooks/useActivityPeriods";
import { useReplayKeyboardShortcuts } from "./hooks/useReplayKeyboardShortcuts";
import { useReplaySeek } from "./hooks/useReplaySeek";
import { useSkipInactivity } from "./hooks/useSkipInactivity";
import { ReplayPlayerControls } from "./ReplayPlayerControls";
import { ReplayPlayerCore } from "./ReplayPlayerCore";
import { ReplayPlayerTopbar } from "./ReplayPlayerTopbar";
import { findPreviousActiveSegment, findSegmentAtTime, SKIP_SECONDS } from "./utils/replayUtils";

export function ReplayPlayer({ width, height, isDrawer }: { width: number; height: number; isDrawer?: boolean }) {
  const params = useParams();
  const siteId = Number(params.site);
  const [replayDrawerOpen, setReplayDrawerOpen] = useState(false);
  const { sessionId, player, isPlaying, setIsPlaying, duration, setPlaybackSpeed } = useReplayStore(
    useShallow(s => ({
      sessionId: s.sessionId,
      player: s.player,
      isPlaying: s.isPlaying,
      setIsPlaying: s.setIsPlaying,
      duration: s.duration,
      setPlaybackSpeed: s.setPlaybackSpeed,
    }))
  );

  const { data, isLoading, error } = useGetSessionReplayEvents(siteId, sessionId);
  const isActiveSurface = Boolean(isDrawer || !replayDrawerOpen);
  const activePlayer = isActiveSurface ? player : null;
  const handleFullscreenOpen = useCallback(() => setReplayDrawerOpen(true), []);

  // Calculate activity periods when player and data are ready
  useActivityPeriods({ data });
  useSkipInactivity({ player: activePlayer });
  const { cancelPreviewSeek, commitPreviewSeek, previewSeek, seekTo } = useReplaySeek();

  const handlePlayPause = useCallback(() => {
    if (!activePlayer) return;

    const newPlayingState = !isPlaying;

    if (isPlaying) {
      activePlayer.pause();
    } else {
      activePlayer.play();
    }
    setIsPlaying(newPlayingState);
  }, [activePlayer, isPlaying, setIsPlaying]);

  const handleSkipBack = useCallback(() => {
    if (!activePlayer) return;
    // Read the precise clock when invoked, without re-rendering the entire
    // player (and replacing its keyboard listener) on every animation frame.
    const { currentTime, replaySegments, skipInactivityEnabled } = useReplayStore.getState();
    const requestedTime = Math.max(0, currentTime - SKIP_SECONDS);
    const requestedSegment = findSegmentAtTime(replaySegments, requestedTime);
    const previousActiveSegment =
      skipInactivityEnabled && requestedSegment && !requestedSegment.isActive && requestedSegment.duration > 3000
        ? findPreviousActiveSegment(replaySegments, requestedSegment.start)
        : null;
    const newTime = previousActiveSegment
      ? Math.max(previousActiveSegment.start, previousActiveSegment.end - 1)
      : requestedTime;
    seekTo(newTime);
  }, [activePlayer, seekTo]);

  const handleSkipForward = useCallback(() => {
    if (!activePlayer) return;
    const { currentTime, duration } = useReplayStore.getState();
    const newTime = Math.min(duration, currentTime + SKIP_SECONDS);
    seekTo(newTime);
  }, [activePlayer, seekTo]);

  const handleSliderChange = useCallback(
    (value: number[]) => {
      if (!activePlayer || !duration) return;

      const newTime = (value[0] / 100) * duration;
      previewSeek(newTime);
    },
    [activePlayer, duration, previewSeek]
  );

  const handleSliderCommit = useCallback(
    (value: number[]) => {
      if (!activePlayer || !duration) return;
      commitPreviewSeek((value[0] / 100) * duration);
    },
    [activePlayer, commitPreviewSeek, duration]
  );

  const handleSpeedChange = useCallback(
    (speed: string) => {
      if (!activePlayer) return;
      setPlaybackSpeed(speed);
    },
    [activePlayer, setPlaybackSpeed]
  );

  // Add keyboard shortcuts
  useReplayKeyboardShortcuts({
    player: activePlayer,
    onSkipBack: handleSkipBack,
    onSkipForward: handleSkipForward,
    onPlayPause: handlePlayPause,
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="text-red-500 mb-4">Error loading replay: {(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div
      className="bg-black flex flex-col justify-between overflow-hidden rounded-lg"
      style={{ width: width, height: height }}
    >
      <ReplayPlayerTopbar />
      {isLoading || !data ? (
        <ThreeDotLoader className="w-full" />
      ) : !isActiveSurface ? (
        <div className="min-h-0 flex-1 bg-black" />
      ) : (
        <ReplayPlayerCore
          data={data}
          width={width}
          height={height}
          onPlayPause={handlePlayPause}
          isPlaying={isPlaying}
        />
      )}
      <ReplayPlayerControls
        events={data?.events || []}
        onPlayPause={handlePlayPause}
        onSliderChange={handleSliderChange}
        onSliderCommit={handleSliderCommit}
        onSliderCancel={cancelPreviewSeek}
        onSpeedChange={handleSpeedChange}
        onFullscreenOpen={!isDrawer ? handleFullscreenOpen : undefined}
        isDrawer={isDrawer}
      />
      {!isDrawer && (
        <ReplayDrawer
          sessionId={sessionId}
          open={replayDrawerOpen}
          onOpenChange={setReplayDrawerOpen}
          preservePlaybackState
        />
      )}
    </div>
  );
}
