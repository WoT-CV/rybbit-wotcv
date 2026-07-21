import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useReplayStore } from "../../replayStore";
import { getInactivityFastForwardSpeed, shouldFastForwardInactivity } from "./inactivityFastForward";
import { findSegmentAtTime } from "../utils/replayUtils";
import type { ReplayPlayerAdapter } from "../ReplayPlayerAdapter";

interface UseSkipInactivityProps {
  player: ReplayPlayerAdapter | null;
}

export function useSkipInactivity({ player }: UseSkipInactivityProps) {
  const appliedSpeedRef = useRef<{ player: ReplayPlayerAdapter; speed: number } | null>(null);
  const { currentTime, duration, isPlaying, playbackSpeed, replaySegments, skipInactivityEnabled } = useReplayStore(
    useShallow(state => ({
      currentTime: state.currentTime,
      duration: state.duration,
      isPlaying: state.isPlaying,
      playbackSpeed: state.playbackSpeed,
      replaySegments: state.replaySegments,
      skipInactivityEnabled: state.skipInactivityEnabled,
    }))
  );

  useEffect(() => {
    if (!player) return;

    const selectedSpeed = Number.parseFloat(playbackSpeed) || 1;
    const currentSegment = findSegmentAtTime(replaySegments, currentTime);
    const shouldFastForward = Boolean(
      skipInactivityEnabled &&
      isPlaying &&
      currentSegment &&
      !currentSegment.isActive &&
      shouldFastForwardInactivity(currentSegment.duration)
    );

    if (!isPlaying) {
      applySpeed(player, selectedSpeed, appliedSpeedRef);
      syncPlaybackMode(false, duration > 0 && currentTime >= duration ? "ended" : "paused");
      return;
    }

    if (shouldFastForward && currentSegment) {
      const fastForwardSpeed = getInactivityFastForwardSpeed(currentSegment.duration, selectedSpeed);
      applySpeed(player, fastForwardSpeed, appliedSpeedRef);
      syncPlaybackMode(true, "skipping-inactivity");
      return;
    }

    applySpeed(player, selectedSpeed, appliedSpeedRef);
    syncPlaybackMode(false, "playing");
  }, [currentTime, duration, isPlaying, playbackSpeed, player, replaySegments, skipInactivityEnabled]);
}

function applySpeed(
  player: ReplayPlayerAdapter,
  speed: number,
  appliedSpeedRef: { current: { player: ReplayPlayerAdapter; speed: number } | null }
) {
  if (appliedSpeedRef.current?.player === player && appliedSpeedRef.current.speed === speed) return;

  player.setSpeed(speed);
  appliedSpeedRef.current = { player, speed };

  const state = useReplayStore.getState();
  if (state.effectivePlaybackSpeed !== speed) state.setEffectivePlaybackSpeed(speed);
}

function syncPlaybackMode(
  isSkippingInactivity: boolean,
  playbackState: "paused" | "playing" | "skipping-inactivity" | "ended"
) {
  const state = useReplayStore.getState();
  if (state.isSkippingInactivity === isSkippingInactivity && state.playbackState === playbackState) return;

  useReplayStore.setState({ isSkippingInactivity, playbackState });
}
