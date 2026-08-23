import { describe, expect, it } from "vitest";
import {
  getReplayMetadataDurationExpression,
  getReplayMetadataReadTable,
  resolveReplayMetadataMode,
  shouldWriteReplayMetadataV1,
  shouldWriteReplayMetadataV2,
} from "./replayMetadataMode.js";

describe("replay metadata rollout mode", () => {
  it("defaults to the rollback-safe v1 table", () => {
    expect(resolveReplayMetadataMode({})).toBe("v1");
    expect(getReplayMetadataReadTable("v1")).toBe("session_replay_metadata");
    expect(getReplayMetadataDurationExpression("v1")).toBe("duration_ms");
  });

  it("uses v2 reads while dual-writing after the operator has backfilled", () => {
    expect(getReplayMetadataReadTable("dual")).toBe("session_replay_metadata_v2");
    expect(shouldWriteReplayMetadataV1("dual")).toBe(true);
    expect(shouldWriteReplayMetadataV2("dual")).toBe(true);
  });

  it("uses only v2 after the rollback window closes", () => {
    expect(shouldWriteReplayMetadataV1("v2")).toBe(false);
    expect(shouldWriteReplayMetadataV2("v2")).toBe(true);
    expect(getReplayMetadataDurationExpression("v2")).toContain("dateDiff");
  });

  it("rejects an unknown mode instead of silently risking a partial rollout", () => {
    expect(() => resolveReplayMetadataMode({ REPLAY_METADATA_MODE: "typo" })).toThrow(
      "Invalid REPLAY_METADATA_MODE"
    );
  });
});
