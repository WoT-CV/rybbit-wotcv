export const REPLAY_METADATA_V1_TABLE = "session_replay_metadata" as const;
export const REPLAY_METADATA_V2_TABLE = "session_replay_metadata_v2" as const;

export type ReplayMetadataMode = "v1" | "dual" | "v2";

/**
 * Resolve the replay metadata rollout mode.
 *
 * v1   - read and write the legacy table (safe default)
 * dual - write both tables and read v2 after a verified one-time backfill
 * v2   - read and write only v2 after the rollback window has closed
 */
export function resolveReplayMetadataMode(env: NodeJS.ProcessEnv = process.env): ReplayMetadataMode {
  const value = env.REPLAY_METADATA_MODE?.trim().toLowerCase() || "v1";

  if (value === "v1" || value === "dual" || value === "v2") {
    return value;
  }

  throw new Error(`Invalid REPLAY_METADATA_MODE: ${env.REPLAY_METADATA_MODE}. Expected v1, dual, or v2.`);
}

export const REPLAY_METADATA_MODE = resolveReplayMetadataMode();

export function shouldWriteReplayMetadataV1(mode: ReplayMetadataMode = REPLAY_METADATA_MODE): boolean {
  return mode !== "v2";
}

export function shouldWriteReplayMetadataV2(mode: ReplayMetadataMode = REPLAY_METADATA_MODE): boolean {
  return mode !== "v1";
}

export function getReplayMetadataReadTable(
  mode: ReplayMetadataMode = REPLAY_METADATA_MODE
): typeof REPLAY_METADATA_V1_TABLE | typeof REPLAY_METADATA_V2_TABLE {
  return mode === "v1" ? REPLAY_METADATA_V1_TABLE : REPLAY_METADATA_V2_TABLE;
}

export function getReplayMetadataDurationExpression(mode: ReplayMetadataMode = REPLAY_METADATA_MODE): string {
  return mode === "v1" ? "duration_ms" : "dateDiff('millisecond', start_time, end_time)";
}
