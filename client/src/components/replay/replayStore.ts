import { create } from "zustand";

import {
  MIN_INACTIVITY_SKIP_MS,
  type ActivityPeriod,
  type ReplayCaptureProfile,
  type ReplaySegment,
} from "./player/utils/replayUtils";

interface InactivitySkipNotice {
  from: number;
  to: number;
  skippedMs: number;
  createdAt: number;
}

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

  skipInactivityEnabled: boolean;
  setSkipInactivityEnabled: (enabled: boolean) => void;

  inactivitySkipThresholdMs: number;
  setInactivitySkipThresholdMs: (thresholdMs: number) => void;

  inactivitySkipNotice: InactivitySkipNotice | null;
  setInactivitySkipNotice: (notice: InactivitySkipNotice | null) => void;

  manualSeekVersion: number;
  registerManualSeek: () => void;

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

  skipInactivityEnabled: true,
  setSkipInactivityEnabled: skipInactivityEnabled => set({ skipInactivityEnabled }),

  inactivitySkipThresholdMs: MIN_INACTIVITY_SKIP_MS,
  setInactivitySkipThresholdMs: inactivitySkipThresholdMs => set({ inactivitySkipThresholdMs }),

  inactivitySkipNotice: null,
  setInactivitySkipNotice: inactivitySkipNotice => set({ inactivitySkipNotice }),

  manualSeekVersion: 0,
  registerManualSeek: () => set(state => ({ manualSeekVersion: state.manualSeekVersion + 1 })),

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
      inactivitySkipNotice: null,
      manualSeekVersion: 0,
    }),
}));
