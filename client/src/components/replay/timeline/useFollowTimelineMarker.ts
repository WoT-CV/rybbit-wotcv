import { useEffect, useRef } from "react";

interface UseFollowTimelineMarkerOptions {
  enabled: boolean;
  markerIndex: number;
  resetKey: string;
  scrollToMarker: () => void;
}

export function useFollowTimelineMarker({
  enabled,
  markerIndex,
  resetKey,
  scrollToMarker,
}: UseFollowTimelineMarkerOptions): void {
  const lastFollowedMarkerRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastFollowedMarkerRef.current = null;
      return;
    }

    const markerKey = `${resetKey}:${markerIndex}`;
    if (lastFollowedMarkerRef.current === markerKey) return;

    scrollToMarker();
    lastFollowedMarkerRef.current = markerKey;
  }, [enabled, markerIndex, resetKey, scrollToMarker]);
}
