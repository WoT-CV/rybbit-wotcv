import { useEffect, useMemo, useState } from "react";

import { useReplayStore } from "../replayStore";
import type { TimelinePositionedRow } from "./replayTimeline";
import {
  getActiveTimelineKeys,
  getCrossedTimelineKeys,
  getSeekTimelineKeys,
  pruneHighlightExpirations,
  updateHighlightExpirations,
} from "./timelineHighlights";

const PLAYING_STATES = new Set(["playing", "skipping-inactivity"]);
const EMPTY_HIGHLIGHTS = new Map<string, number>();

interface RecentHighlightState {
  resetKey: string;
  expirations: Map<string, number>;
}

export function useReplayTimelineHighlights(rows: readonly TimelinePositionedRow[], resetKey: string) {
  const currentTime = useReplayStore(state => state.currentTime);
  const [recentHighlights, setRecentHighlights] = useState<RecentHighlightState>(() => ({
    resetKey,
    expirations: new Map(),
  }));
  const recentExpirations = recentHighlights.resetKey === resetKey ? recentHighlights.expirations : EMPTY_HIGHLIGHTS;

  useEffect(() => {
    return useReplayStore.subscribe((state, previousState) => {
      const seekChanged = previousState.seekRevision !== state.seekRevision;
      const movedBackwards = state.currentTime < previousState.currentTime;
      const now = Date.now();

      if (seekChanged || movedBackwards) {
        const keys = getSeekTimelineKeys(rows, state.currentTime);
        setRecentHighlights({
          resetKey,
          expirations: updateHighlightExpirations(new Map(), keys, now),
        });
        return;
      }

      if (!PLAYING_STATES.has(state.playbackState) || state.currentTime <= previousState.currentTime) return;

      const keys = getCrossedTimelineKeys(rows, previousState.currentTime, state.currentTime);
      if (keys.length === 0) return;

      setRecentHighlights(current => ({
        resetKey,
        expirations: updateHighlightExpirations(
          current.resetKey === resetKey ? current.expirations : EMPTY_HIGHLIGHTS,
          keys,
          now
        ),
      }));
    });
  }, [resetKey, rows]);

  useEffect(() => {
    if (recentExpirations.size === 0) return;

    const now = Date.now();
    const nextExpiration = Math.min(...recentExpirations.values());
    const timeoutId = window.setTimeout(
      () => {
        setRecentHighlights(current =>
          current.resetKey === resetKey
            ? { resetKey, expirations: pruneHighlightExpirations(current.expirations, Date.now()) }
            : current
        );
      },
      Math.max(0, nextExpiration - now) + 1
    );

    return () => window.clearTimeout(timeoutId);
  }, [recentExpirations, resetKey]);

  const highlightedKeys = useMemo(() => {
    const keys = new Set(recentExpirations.keys());
    for (const key of getActiveTimelineKeys(rows, currentTime)) keys.add(key);
    return keys;
  }, [currentTime, recentExpirations, rows]);

  return { currentTime, highlightedKeys };
}
