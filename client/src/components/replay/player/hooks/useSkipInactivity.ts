import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useReplayStore } from "../../replayStore";
import { useReplaySeek } from "./useReplaySeek";
import { findSegmentAtTime } from "../utils/replayUtils";
import type { ReplayPlayerAdapter } from "../ReplayPlayerAdapter";

interface UseSkipInactivityProps {
  player: ReplayPlayerAdapter | null;
}

export function useSkipInactivity({ player }: UseSkipInactivityProps) {
  const appliedSpeedRef = useRef<number | null>(null);
  const skippingSegmentRef = useRef<string | null>(null);
  const { seekTo } = useReplaySeek();
  const {
    currentTime,
    duration,
    isPlaying,
    playbackSpeed,
    replaySegments,
    setEffectivePlaybackSpeed,
    setIsSkippingInactivity,
    setPlaybackState,
    skipInactivityEnabled,
  } = useReplayStore(
    useShallow(state => ({
      currentTime: state.currentTime,
      duration: state.duration,
      isPlaying: state.isPlaying,
      playbackSpeed: state.playbackSpeed,
      replaySegments: state.replaySegments,
      setEffectivePlaybackSpeed: state.setEffectivePlaybackSpeed,
      setIsSkippingInactivity: state.setIsSkippingInactivity,
      setPlaybackState: state.setPlaybackState,
      skipInactivityEnabled: state.skipInactivityEnabled,
    }))
  );

  useEffect(() => {
    if (!player) return;

    const selectedSpeed = Number.parseFloat(playbackSpeed) || 1;
    const currentSegment = findSegmentAtTime(replaySegments, currentTime);
    const shouldSkip = Boolean(skipInactivityEnabled && isPlaying && currentSegment && !currentSegment.isActive);

    if (!isPlaying) {
      skippingSegmentRef.current = null;
      applySpeed(player, selectedSpeed, appliedSpeedRef, setEffectivePlaybackSpeed);
      setIsSkippingInactivity(false);
      setPlaybackState(duration > 0 && currentTime >= duration ? "ended" : "paused");
      return;
    }

    if (shouldSkip && currentSegment) {
      const segmentKey = `${currentSegment.start}:${currentSegment.end}`;
      if (skippingSegmentRef.current !== segmentKey) {
        skippingSegmentRef.current = segmentKey;
        applySpeed(player, selectedSpeed, appliedSpeedRef, setEffectivePlaybackSpeed);
        setIsSkippingInactivity(true);
        setPlaybackState("skipping-inactivity");
        seekTo(currentSegment.end, true);
        return;
      }
      return;
    }

    skippingSegmentRef.current = null;
    applySpeed(player, selectedSpeed, appliedSpeedRef, setEffectivePlaybackSpeed);
    setIsSkippingInactivity(false);
    setPlaybackState("playing");
  }, [
    currentTime,
    duration,
    isPlaying,
    playbackSpeed,
    player,
    replaySegments,
    setEffectivePlaybackSpeed,
    setIsSkippingInactivity,
    setPlaybackState,
    seekTo,
    skipInactivityEnabled,
  ]);
}

function applySpeed(
  player: ReplayPlayerAdapter,
  speed: number,
  appliedSpeedRef: { current: number | null },
  setEffectivePlaybackSpeed: (speed: number) => void
) {
  if (appliedSpeedRef.current === speed) return;
  player.setSpeed(speed);
  appliedSpeedRef.current = speed;
  setEffectivePlaybackSpeed(speed);
}
