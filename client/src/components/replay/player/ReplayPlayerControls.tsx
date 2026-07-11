import { Maximize2, Pause, Play, SkipForward } from "lucide-react";
import { useExtracted } from "next-intl";
import { memo, useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { ActivitySlider } from "@/components/ui/activity-slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ReplayDrawer } from "../../Sessions/ReplayDrawer";
import { parseNetworkEvents } from "../network/parseNetworkEvents";
import type { ReplayEventLike } from "../network/types";
import { useReplayStore } from "../replayStore";
import { formatTime, PLAYBACK_SPEEDS } from "./utils/replayUtils";

interface ReplayPlayerControlsProps {
  events: ReplayEventLike[];
  onPlayPause: () => void;
  onSliderChange: (value: number[]) => void;
  onSpeedChange: (speed: string) => void;
  isDrawer?: boolean;
}

export const ReplayPlayerControls = memo(function ReplayPlayerControls({
  events,
  onPlayPause,
  onSliderChange,
  onSpeedChange,
  isDrawer,
}: ReplayPlayerControlsProps) {
  const t = useExtracted();
  const {
    activityPeriods,
    canSkipInactivity,
    currentTime,
    duration,
    isPlaying,
    playbackSpeed,
    player,
    replaySegments,
    sessionId,
    setCurrentTime,
    setIsPlaying,
    setSkipInactivityEnabled,
    skipInactivityEnabled,
  } = useReplayStore(
    useShallow(s => ({
      activityPeriods: s.activityPeriods,
      canSkipInactivity: s.canSkipInactivity,
      currentTime: s.currentTime,
      duration: s.duration,
      isPlaying: s.isPlaying,
      playbackSpeed: s.playbackSpeed,
      player: s.player,
      replaySegments: s.replaySegments,
      sessionId: s.sessionId,
      setCurrentTime: s.setCurrentTime,
      setIsPlaying: s.setIsPlaying,
      setSkipInactivityEnabled: s.setSkipInactivityEnabled,
      skipInactivityEnabled: s.skipInactivityEnabled,
    }))
  );
  const [replayDrawerOpen, setReplayDrawerOpen] = useState(false);
  const networkRequests = useMemo(() => parseNetworkEvents(events), [events]);

  const handleSkipInactivityToggle = useCallback(() => {
    setSkipInactivityEnabled(!skipInactivityEnabled);
  }, [setSkipInactivityEnabled, skipInactivityEnabled]);

  const handleNetworkSeek = useCallback(
    (offset: number) => {
      if (!player) return;
      player.pause();
      setIsPlaying(false);
      player.goto(offset);
      setCurrentTime(offset);
    },
    [player, setCurrentTime, setIsPlaying]
  );

  return (
    <div className="border border-neutral-100 dark:border-neutral-800 p-2 pb-3 bg-white dark:bg-neutral-900 rounded-b-lg pt-6">
      <div className="flex items-center">
        <Button variant="ghost" size="smIcon" onClick={onPlayPause} disabled={!player}>
          {isPlaying ? (
            <Pause className="w-4 h-4" fill="currentColor" />
          ) : (
            <Play className="w-4 h-4" fill="currentColor" />
          )}
        </Button>
        <div className="flex-1 mx-2 -mt-8">
          <ActivitySlider
            value={[duration > 0 ? (currentTime / duration) * 100 : 0]}
            onValueChange={onSliderChange}
            max={100}
            step={0.1}
            activityPeriods={activityPeriods}
            replaySegments={replaySegments}
            duration={duration}
            events={events}
            networkRequests={networkRequests}
            currentTime={currentTime}
            onNetworkSeek={handleNetworkSeek}
            className="w-full"
          />
        </div>
        <div className="text-xs text-neutral-700 dark:text-neutral-300 w-20 text-center">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            variant={skipInactivityEnabled && canSkipInactivity ? "secondary" : "outline"}
            size="xs"
            aria-pressed={skipInactivityEnabled && canSkipInactivity}
            disabled={!canSkipInactivity}
            onClick={handleSkipInactivityToggle}
            title={
              canSkipInactivity
                ? t("Skip inactivity")
                : t("Inactivity skipping is unavailable for legacy recordings")
            }
          >
            <SkipForward className="h-3 w-3" aria-hidden="true" />
            <span className="hidden xl:inline">{t("Skip inactivity")}</span>
          </Button>
        </div>

        <Select value={playbackSpeed} onValueChange={onSpeedChange}>
          <SelectTrigger size="sm" className="w-14 mx-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent size="sm">
            {PLAYBACK_SPEEDS.map(speed => (
              <SelectItem key={speed.value} value={speed.value} size="sm">
                {speed.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isDrawer && (
          <Button variant="ghost" size="smIcon" onClick={() => setReplayDrawerOpen(true)}>
            <Maximize2 className="w-4 h-4" />
          </Button>
        )}
        <ReplayDrawer sessionId={sessionId} open={replayDrawerOpen} onOpenChange={setReplayDrawerOpen} />
      </div>
    </div>
  );
});
