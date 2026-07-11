import { Download, Maximize2, Pause, Play, SkipForward } from "lucide-react";
import { useExtracted } from "next-intl";
import { memo, useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { ActivitySlider } from "@/components/ui/activity-slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ReplayDrawer } from "../../Sessions/ReplayDrawer";
import { ReplayExportDialog } from "../export/ReplayExportDialog";
import { parseNetworkEvents } from "../network/parseNetworkEvents";
import type { ReplayEventLike } from "../network/types";
import { useReplayStore } from "../replayStore";
import { useReplaySeek } from "./hooks/useReplaySeek";
import { formatTime, PLAYBACK_SPEEDS } from "./utils/replayUtils";

interface ReplayPlayerControlsProps {
  events: ReplayEventLike[];
  onPlayPause: () => void;
  onSliderChange: (value: number[]) => void;
  onSliderCommit: (value: number[]) => void;
  onSpeedChange: (speed: string) => void;
  isDrawer?: boolean;
}

export const ReplayPlayerControls = memo(function ReplayPlayerControls({
  events,
  onPlayPause,
  onSliderChange,
  onSliderCommit,
  onSpeedChange,
  isDrawer,
}: ReplayPlayerControlsProps) {
  const t = useExtracted();
  const {
    activityPeriods,
    currentTime,
    duration,
    exportRange,
    isPlaying,
    playbackSpeed,
    player,
    replaySegments,
    sessionId,
    setSkipInactivityEnabled,
    skipInactivityEnabled,
  } = useReplayStore(
    useShallow(s => ({
      activityPeriods: s.activityPeriods,
      currentTime: s.currentTime,
      duration: s.duration,
      exportRange: s.exportRange,
      isPlaying: s.isPlaying,
      playbackSpeed: s.playbackSpeed,
      player: s.player,
      replaySegments: s.replaySegments,
      sessionId: s.sessionId,
      setSkipInactivityEnabled: s.setSkipInactivityEnabled,
      skipInactivityEnabled: s.skipInactivityEnabled,
    }))
  );
  const [replayDrawerOpen, setReplayDrawerOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const networkRequests = useMemo(() => parseNetworkEvents(events), [events]);
  const { seekTo } = useReplaySeek();

  const handleSkipInactivityToggle = useCallback(() => {
    setSkipInactivityEnabled(!skipInactivityEnabled);
  }, [setSkipInactivityEnabled, skipInactivityEnabled]);

  const handleNetworkSeek = useCallback(
    (offset: number) => {
      seekTo(offset);
    },
    [seekTo]
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
            onValueCommit={onSliderCommit}
            max={100}
            step={0.1}
            activityPeriods={activityPeriods}
            replaySegments={replaySegments}
            duration={duration}
            events={events}
            networkRequests={networkRequests}
            currentTime={currentTime}
            exportRange={exportRange}
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
            variant="outline"
            size="xs"
            disabled={!player || duration <= 0}
            onClick={() => setExportDialogOpen(true)}
            title={t("Export replay range")}
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            <span className="hidden 2xl:inline">{t("Export")}</span>
          </Button>
          <Button
            type="button"
            variant={skipInactivityEnabled ? "secondary" : "outline"}
            size="xs"
            aria-pressed={skipInactivityEnabled}
            onClick={handleSkipInactivityToggle}
            title={t("Skip inactivity")}
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
        <ReplayExportDialog
          currentTime={currentTime}
          duration={duration}
          open={exportDialogOpen}
          sessionId={sessionId}
          onOpenChange={setExportDialogOpen}
        />
      </div>
    </div>
  );
});
