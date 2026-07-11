import { Pause, Play } from "lucide-react";
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
  const { currentTime, isSkippingInactivity, replaySegments } = useReplayStore(
    useShallow(state => ({
      currentTime: state.currentTime,
      isSkippingInactivity: state.isSkippingInactivity,
      replaySegments: state.replaySegments,
    }))
  );
  const [showPlayPauseOverlay, setShowPlayPauseOverlay] = useState(false);
  const [overlayIcon, setOverlayIcon] = useState<"play" | "pause">("play");
  const overlayTimeoutRef = useRef<number | undefined>(undefined);
  const currentSegment = findSegmentAtTime(replaySegments, currentTime);
  const remainingInactivity = currentSegment?.isActive ? 0 : Math.max(0, (currentSegment?.end ?? 0) - currentTime);

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
      {isSkippingInactivity && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
          <div className="rounded-lg bg-black/70 px-6 py-4 text-center text-white shadow-2xl backdrop-blur-sm">
            <div className="text-xl font-medium italic">{t("Skipping inactivity")}</div>
            <div className="mt-1 text-sm tabular-nums text-neutral-300">{formatTime(remainingInactivity)}</div>
          </div>
        </div>
      )}
    </>
  );
}
