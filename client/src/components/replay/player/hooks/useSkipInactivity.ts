import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useReplayStore } from "../../replayStore";
import { findNextActivityPeriod } from "../utils/replayUtils";

interface UseSkipInactivityProps {
  player: any;
}

const MANUAL_SEEK_SUPPRESSION_MS = 1500;

export function useSkipInactivity({ player }: UseSkipInactivityProps) {
  const lastSkippedTargetRef = useRef<number | null>(null);
  const skipSuppressedUntilRef = useRef(0);
  const {
    activityPeriods,
    currentTime,
    duration,
    inactivitySkipThresholdMs,
    isPlaying,
    manualSeekVersion,
    setCurrentTime,
    setInactivitySkipNotice,
    setIsPlaying,
    skipInactivityEnabled,
  } = useReplayStore(
    useShallow(state => ({
      activityPeriods: state.activityPeriods,
      currentTime: state.currentTime,
      duration: state.duration,
      inactivitySkipThresholdMs: state.inactivitySkipThresholdMs,
      isPlaying: state.isPlaying,
      manualSeekVersion: state.manualSeekVersion,
      setCurrentTime: state.setCurrentTime,
      setInactivitySkipNotice: state.setInactivitySkipNotice,
      setIsPlaying: state.setIsPlaying,
      skipInactivityEnabled: state.skipInactivityEnabled,
    }))
  );

  useEffect(() => {
    if (manualSeekVersion === 0) return;

    skipSuppressedUntilRef.current = Date.now() + MANUAL_SEEK_SUPPRESSION_MS;
    lastSkippedTargetRef.current = null;
  }, [manualSeekVersion]);

  useEffect(() => {
    if (!skipInactivityEnabled || !isPlaying || !player || activityPeriods.length === 0) {
      lastSkippedTargetRef.current = null;
      return;
    }

    if (Date.now() < skipSuppressedUntilRef.current) {
      return;
    }

    const nextActivity = findNextActivityPeriod(currentTime, activityPeriods, inactivitySkipThresholdMs, duration);

    if (!nextActivity) {
      lastSkippedTargetRef.current = null;
      return;
    }

    if (lastSkippedTargetRef.current === nextActivity.start) {
      return;
    }

    lastSkippedTargetRef.current = nextActivity.start;
    player.goto(nextActivity.start);
    if (nextActivity.start < duration) {
      window.requestAnimationFrame(() => {
        player.play?.();
      });
    } else {
      setIsPlaying(false);
    }
    setCurrentTime(nextActivity.start);
    setInactivitySkipNotice({
      from: nextActivity.from,
      to: nextActivity.to,
      skippedMs: nextActivity.skippedMs,
      createdAt: Date.now(),
    });
  }, [
    activityPeriods,
    currentTime,
    duration,
    inactivitySkipThresholdMs,
    isPlaying,
    player,
    setCurrentTime,
    setInactivitySkipNotice,
    setIsPlaying,
    skipInactivityEnabled,
  ]);
}
