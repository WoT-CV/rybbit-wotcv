import { FastForward, Pause, Play } from "lucide-react";
import { useExtracted } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useReplayStore } from "../replayStore";
import { findSegmentAtTime, formatTime, OVERLAY_TIMEOUT } from "./utils/replayUtils";

interface ReplayPlayerOverlayProps {
  onPlayPause: () => void;
  isPlaying: boolean;
}

export function ReplayPlayerOverlay({ onPlayPause, isPlaying }: ReplayPlayerOverlayProps) {
  const t = useExtracted();
  const { currentTime, effectivePlaybackSpeed, isSkippingInactivity, replaySegments } = useReplayStore(
    useShallow(state => ({
      currentTime: state.currentTime,
      effectivePlaybackSpeed: state.effectivePlaybackSpeed,
      isSkippingInactivity: state.isSkippingInactivity,
      replaySegments: state.replaySegments,
    }))
  );
  const [showPlayPauseOverlay, setShowPlayPauseOverlay] = useState(false);
  const [overlayIcon, setOverlayIcon] = useState<"play" | "pause">("play");
  const overlayTimeoutRef = useRef<number | undefined>(undefined);
  const currentSegment = findSegmentAtTime(replaySegments, currentTime);
  const remainingInactivity = currentSegment?.isActive ? 0 : Math.max(0, (currentSegment?.end ?? 0) - currentTime);
  const showInactivityOverlay = Boolean(isSkippingInactivity && currentSegment && !currentSegment.isActive);
  const displayedSpeed = Number.isInteger(effectivePlaybackSpeed)
    ? effectivePlaybackSpeed.toString()
    : effectivePlaybackSpeed.toFixed(1);

  // Cleanup overlay timeout on unmount
  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  const handlePlayPauseWithOverlay = () => {
    const newPlayingState = !isPlaying;
    onPlayPause();

    // Show overlay animation
    setOverlayIcon(newPlayingState ? "pause" : "play");
    setShowPlayPauseOverlay(true);

    // Clear existing timeout
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }

    // Hide overlay after animation
    overlayTimeoutRef.current = window.setTimeout(() => {
      setShowPlayPauseOverlay(false);
    }, OVERLAY_TIMEOUT);
  };

  return (
    <>
      <div className="absolute inset-0 cursor-pointer" onClick={handlePlayPauseWithOverlay} />

      {showPlayPauseOverlay && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 rounded-full p-6 animate-in fade-in zoom-in-50 duration-200">
            {overlayIcon === "play" ? (
              <Play className="w-12 h-12 text-white" fill="currentColor" />
            ) : (
              <Pause className="w-12 h-12 text-white" fill="currentColor" />
            )}
          </div>
        </div>
      )}
      {showInactivityOverlay && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="rounded-lg border border-white/15 bg-black/85 px-5 py-3 text-center text-white">
            <div className="flex items-center justify-center gap-2 text-base font-medium">
              <FastForward className="h-4 w-4" aria-hidden="true" />
              <span role="status" aria-live="polite" aria-atomic="true">
                {t("Skipping inactivity")}
              </span>
            </div>
            <div className="mt-1 text-sm tabular-nums text-neutral-300" aria-hidden="true">
              {displayedSpeed}× · {formatTime(remainingInactivity)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
