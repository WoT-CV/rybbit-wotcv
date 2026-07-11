import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import { useReplayStore } from "../../replayStore";
import { calculateReplayTimeline } from "../utils/replayUtils";

interface UseActivityPeriodsProps {
  data: { events: any[] } | undefined;
}

export const useActivityPeriods = ({ data }: UseActivityPeriodsProps) => {
  const {
    duration,
    setActivityPeriods,
    setCanSkipInactivity,
    setReplayCaptureProfile,
    setReplaySegments,
  } = useReplayStore(
    useShallow(state => ({
      duration: state.duration,
      setActivityPeriods: state.setActivityPeriods,
      setCanSkipInactivity: state.setCanSkipInactivity,
      setReplayCaptureProfile: state.setReplayCaptureProfile,
      setReplaySegments: state.setReplaySegments,
    }))
  );

  useEffect(() => {
    if (!data?.events?.length || duration <= 0) return;

    const timeline = calculateReplayTimeline(data.events, duration);
    setActivityPeriods(timeline.activityPeriods);
    setCanSkipInactivity(timeline.canSkipInactivity);
    setReplaySegments(timeline.segments);
    setReplayCaptureProfile(timeline.captureProfile);
  }, [data, duration, setActivityPeriods, setCanSkipInactivity, setReplayCaptureProfile, setReplaySegments]);
};
