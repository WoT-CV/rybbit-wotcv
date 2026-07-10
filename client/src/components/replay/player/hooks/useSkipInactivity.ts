import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useReplayStore } from "../../replayStore";
import { findNextActivityPeriod } from "../utils/replayUtils";

interface UseSkipInactivityProps {
  player: any;
}

export function useSkipInactivity({ player }: UseSkipInactivityProps) {
  const lastSkippedTargetRef = useRef<number | null>(null);
  const {
    activityPeriods,
    currentTime,
    inactivitySkipThresholdMs,
    isPlaying,
    setCurrentTime,
    setInactivitySkipNotice,
    skipInactivityEnabled,
  } = useReplayStore(
    useShallow(state => ({
      activityPeriods: state.activityPeriods,
      currentTime: state.currentTime,
      inactivitySkipThresholdMs: state.inactivitySkipThresholdMs,
      isPlaying: state.isPlaying,
      setCurrentTime: state.setCurrentTime,
      setInactivitySkipNotice: state.setInactivitySkipNotice,
      skipInactivityEnabled: state.skipInactivityEnabled,
    }))
  );

  useEffect(() => {
    if (!skipInactivityEnabled || !isPlaying || !player || activityPeriods.length === 0) {
      lastSkippedTargetRef.current = null;
      return;
    }

    const nextActivity = findNextActivityPeriod(currentTime, activityPeriods, inactivitySkipThresholdMs);

    if (!nextActivity) {
      lastSkippedTargetRef.current = null;
      return;
    }

    if (lastSkippedTargetRef.current === nextActivity.start) {
      return;
    }

    lastSkippedTargetRef.current = nextActivity.start;
    player.goto(nextActivity.start);
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
    inactivitySkipThresholdMs,
    isPlaying,
    player,
    setCurrentTime,
    setInactivitySkipNotice,
    skipInactivityEnabled,
  ]);
}
