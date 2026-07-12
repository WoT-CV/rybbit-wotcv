import { getReplayActivityDuration, MAX_REPLAY_EXPORT_DURATION_MS, type ReplayActivityPeriod } from "@rybbit/shared";

export function validateReplayExportActivityDuration(periods: readonly ReplayActivityPeriod[]): number {
  const outputDurationMs = getReplayActivityDuration(periods);

  if (outputDurationMs <= 0) {
    throw new Error("Selected replay range contains no user activity");
  }
  if (outputDurationMs > MAX_REPLAY_EXPORT_DURATION_MS) {
    throw new Error("Replay export cannot exceed 2 minutes of active playback");
  }

  return outputDurationMs;
}
