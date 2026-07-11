import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useReplayStore } from "../../replayStore";
import { findSegmentAtTime } from "../utils/replayUtils";

interface UseSkipInactivityProps {
  player: any;
}

const MIN_SKIP_SPEED = 50;

export function useSkipInactivity({ player }: UseSkipInactivityProps) {
  const appliedSpeedRef = useRef<number | null>(null);
  const skippingSegmentRef = useRef<string | null>(null);
  const {
    canSkipInactivity,
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
      canSkipInactivity: state.canSkipInactivity,
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
    const shouldSkip = Boolean(
      canSkipInactivity && skipInactivityEnabled && isPlaying && currentSegment && !currentSegment.isActive
    );

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
        const secondsRemaining = Math.max(0, (currentSegment.end - currentTime) / 1000);
        const skipSpeed = Math.max(MIN_SKIP_SPEED, secondsRemaining);
        skippingSegmentRef.current = segmentKey;
        applySpeed(player, skipSpeed, appliedSpeedRef, setEffectivePlaybackSpeed);
      }
      setIsSkippingInactivity(true);
      setPlaybackState("skipping-inactivity");
      return;
    }

    skippingSegmentRef.current = null;
    applySpeed(player, selectedSpeed, appliedSpeedRef, setEffectivePlaybackSpeed);
    setIsSkippingInactivity(false);
    setPlaybackState("playing");
  }, [
    canSkipInactivity,
    currentTime,
    duration,
    isPlaying,
    playbackSpeed,
    player,
    replaySegments,
    setEffectivePlaybackSpeed,
    setIsSkippingInactivity,
    setPlaybackState,
    skipInactivityEnabled,
  ]);
}

function applySpeed(
  player: any,
  speed: number,
  appliedSpeedRef: { current: number | null },
  setEffectivePlaybackSpeed: (speed: number) => void
) {
  if (appliedSpeedRef.current === speed) return;
  player.setSpeed(speed);
  appliedSpeedRef.current = speed;
  setEffectivePlaybackSpeed(speed);
}
