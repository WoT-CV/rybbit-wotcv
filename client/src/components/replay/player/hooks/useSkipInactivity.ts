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
  // Evaluate every clock update, but only notify React when the playback mode
  // actually changes. Throttling the clock itself would overshoot activity
  // boundaries at 25x/50x; subscribing the whole player to it wastes each frame.
  const { speed, isSkippingInactivity, playbackState, seekRevision } = useReplayStore(
    useShallow(state => {
      const selectedSpeed = Number.parseFloat(state.playbackSpeed) || 1;
      const currentSegment = findSegmentAtTime(state.replaySegments, state.currentTime);
      const shouldFastForward = Boolean(
        state.skipInactivityEnabled &&
        state.isPlaying &&
        currentSegment &&
        !currentSegment.isActive &&
        shouldFastForwardInactivity(currentSegment.duration)
      );

      if (!state.isPlaying) {
        return {
          speed: selectedSpeed,
          isSkippingInactivity: false,
          seekRevision: state.seekRevision,
          playbackState:
            state.duration > 0 && state.currentTime >= state.duration ? ("ended" as const) : ("paused" as const),
        };
      }

      return {
        speed:
          shouldFastForward && currentSegment
            ? getInactivityFastForwardSpeed(currentSegment.duration, selectedSpeed, state.skipInactivitySpeed)
            : selectedSpeed,
        isSkippingInactivity: shouldFastForward,
        seekRevision: state.seekRevision,
        playbackState: shouldFastForward ? ("skipping-inactivity" as const) : ("playing" as const),
      };
    })
  );

  useEffect(() => {
    if (!player) return;
    applySpeed(player, speed, appliedSpeedRef);
    syncPlaybackMode(isSkippingInactivity, playbackState);
  }, [isSkippingInactivity, playbackState, player, seekRevision, speed]);
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
  if (state.playbackState === "seeking") return;
  if (state.isSkippingInactivity === isSkippingInactivity && state.playbackState === playbackState) return;

  useReplayStore.setState({ isSkippingInactivity, playbackState });
}
