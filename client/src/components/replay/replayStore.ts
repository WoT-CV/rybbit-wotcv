import { create } from "zustand";

import type { ActivityPeriod, ReplayCaptureProfile, ReplaySegment } from "./player/utils/replayUtils";

export type ReplayPlaybackState =
  | "paused"
  | "playing"
  | "skipping-inactivity"
  | "seeking"
  | "buffering"
  | "ended";

export const useReplayStore = create<{
  minDuration: number;
  setMinDuration: (minDuration: number) => void;

  // Session selection
  sessionId: string;
  setSessionId: (sessionId: string) => void;

  // Player state
  player: any;
  setPlayer: (player: any) => void;

  // Playback state
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;

  currentTime: number;
  setCurrentTime: (currentTime: number) => void;

  duration: number;
  setDuration: (duration: number) => void;

  playbackSpeed: string;
  setPlaybackSpeed: (speed: string) => void;

  effectivePlaybackSpeed: number;
  setEffectivePlaybackSpeed: (speed: number) => void;

  playbackState: ReplayPlaybackState;
  setPlaybackState: (state: ReplayPlaybackState) => void;

  isSkippingInactivity: boolean;
  setIsSkippingInactivity: (isSkipping: boolean) => void;

  activityPeriods: ActivityPeriod[];
  setActivityPeriods: (periods: ActivityPeriod[]) => void;

  replaySegments: ReplaySegment[];
  setReplaySegments: (segments: ReplaySegment[]) => void;

  replayCaptureProfile: ReplayCaptureProfile;
  setReplayCaptureProfile: (profile: ReplayCaptureProfile) => void;

  canSkipInactivity: boolean;
  setCanSkipInactivity: (canSkip: boolean) => void;

  skipInactivityEnabled: boolean;
  setSkipInactivityEnabled: (enabled: boolean) => void;

  // Reset all player state when session changes
  resetPlayerState: () => void;
}>(set => ({
  minDuration: 30,
  setMinDuration: minDuration => set({ minDuration }),

  // Session selection
  sessionId: "",
  setSessionId: sessionId => set({ sessionId }),

  // Player state
  player: null,
  setPlayer: player => set({ player }),

  // Playback state
  isPlaying: false,
  setIsPlaying: isPlaying => set({ isPlaying }),

  currentTime: 0,
  setCurrentTime: currentTime => set({ currentTime }),

  duration: 0,
  setDuration: duration => set({ duration }),

  playbackSpeed: "1",
  setPlaybackSpeed: playbackSpeed => set({ playbackSpeed }),

  effectivePlaybackSpeed: 1,
  setEffectivePlaybackSpeed: effectivePlaybackSpeed => set({ effectivePlaybackSpeed }),

  playbackState: "paused",
  setPlaybackState: playbackState => set({ playbackState }),

  isSkippingInactivity: false,
  setIsSkippingInactivity: isSkippingInactivity => set({ isSkippingInactivity }),

  activityPeriods: [],
  setActivityPeriods: activityPeriods => set({ activityPeriods }),

  replaySegments: [],
  setReplaySegments: replaySegments => set({ replaySegments }),

  replayCaptureProfile: "legacy",
  setReplayCaptureProfile: replayCaptureProfile => set({ replayCaptureProfile }),

  canSkipInactivity: false,
  setCanSkipInactivity: canSkipInactivity => set({ canSkipInactivity }),

  skipInactivityEnabled: true,
  setSkipInactivityEnabled: skipInactivityEnabled => set({ skipInactivityEnabled }),

  // Reset all player state when session changes
  resetPlayerState: () =>
    set({
      player: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playbackSpeed: "1",
      effectivePlaybackSpeed: 1,
      playbackState: "paused",
      isSkippingInactivity: false,
      activityPeriods: [],
      replaySegments: [],
      replayCaptureProfile: "legacy",
      canSkipInactivity: false,
    }),
}));
