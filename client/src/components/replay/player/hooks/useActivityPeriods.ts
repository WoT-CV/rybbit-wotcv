import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import { useReplayStore } from "../../replayStore";
import { calculateReplayTimeline } from "../utils/replayUtils";

interface UseActivityPeriodsProps {
  data: { events: any[] } | undefined;
}

export const useActivityPeriods = ({ data }: UseActivityPeriodsProps) => {
  const { duration, setActivityPeriods, setReplayCaptureProfile, setReplaySegments } = useReplayStore(
    useShallow(state => ({
      duration: state.duration,
      setActivityPeriods: state.setActivityPeriods,
      setReplayCaptureProfile: state.setReplayCaptureProfile,
      setReplaySegments: state.setReplaySegments,
    }))
  );

  useEffect(() => {
    if (!data?.events?.length || duration <= 0) return;

    const timeline = calculateReplayTimeline(data.events, duration);
    setActivityPeriods(timeline.activityPeriods);
    setReplaySegments(timeline.segments);
    setReplayCaptureProfile(timeline.captureProfile);
  }, [data, duration, setActivityPeriods, setReplayCaptureProfile, setReplaySegments]);
};
