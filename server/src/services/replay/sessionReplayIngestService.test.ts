import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordSessionReplayRequest } from "../../types/sessionReplay.js";

const mocks = vi.hoisted(() => ({
  generateUserId: vi.fn(),
  generateUserIdFromClientId: vi.fn(),
  insert: vi.fn(),
  query: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("../../db/clickhouse/clickhouse.js", () => ({
  clickhouse: {
    insert: mocks.insert,
    query: mocks.query,
  },
}));

vi.mock("../sessions/sessionsService.js", () => ({
  sessionsService: {
    updateSession: mocks.updateSession,
  },
}));

vi.mock("../userId/userIdService.js", () => ({
  userIdService: {
    generateUserId: mocks.generateUserId,
    generateUserIdFromClientId: mocks.generateUserIdFromClientId,
  },
}));

vi.mock("../storage/r2StorageService.js", () => ({
  r2Storage: {
    isEnabled: () => false,
  },
}));

vi.mock("../../lib/siteConfig.js", () => ({
  siteConfig: {},
}));

import { SessionReplayIngestService } from "./sessionReplayIngestService.js";

const requestMeta = {
  ipAddress: "198.51.100.10",
  userAgent: "Standardized Corporate Browser/1.0",
  origin: "https://internal.example",
  referrer: "",
};

function replayRequest(identifiedUserId: string, anonymousId?: string): RecordSessionReplayRequest {
  return {
    anonymousId,
    userId: identifiedUserId,
    events: [{ type: 2, data: { user: identifiedUserId }, timestamp: 1_700_000_000_000 }],
  };
}

describe("SessionReplayIngestService identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateUserId.mockResolvedValue("shared-fingerprint");
    mocks.generateUserIdFromClientId.mockImplementation(async anonymousId => `fingerprint-${anonymousId}`);
    mocks.updateSession.mockImplementation(
      async ({ userId, identifiedUserId }: { userId: string; identifiedUserId?: string }) => ({
        sessionId: `session-${userId}-${identifiedUserId || "anonymous"}`,
      })
    );
    mocks.insert.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue({
      json: async () => [
        {
          start_time: "2026-08-23 10:00:00",
          end_time: "2026-08-23 10:00:01",
          event_count: "1",
          compressed_size_bytes: "20",
          screen_width: "1920",
          screen_height: "1080",
        },
      ],
    });
  });

  it("separates identified replay users behind a shared proxy", async () => {
    const service = new SessionReplayIngestService();

    await service.recordEvents(42, replayRequest("employee-alice", "browser-alice"), requestMeta);
    await service.recordEvents(42, replayRequest("employee-bob", "browser-bob"), requestMeta);

    expect(mocks.updateSession).toHaveBeenNthCalledWith(1, {
      userId: "fingerprint-browser-alice",
      identifiedUserId: "employee-alice",
      siteId: 42,
    });
    expect(mocks.updateSession).toHaveBeenNthCalledWith(2, {
      userId: "fingerprint-browser-bob",
      identifiedUserId: "employee-bob",
      siteId: 42,
    });

    const insertedRows = mocks.insert.mock.calls.flatMap(call => call[0].values);
    expect(new Set(insertedRows.map(row => row.user_id))).toEqual(
      new Set(["fingerprint-browser-alice", "fingerprint-browser-bob"])
    );
    expect(new Set(insertedRows.map(row => row.identified_user_id))).toEqual(
      new Set(["employee-alice", "employee-bob"])
    );
    expect(new Set(insertedRows.map(row => row.session_id)).size).toBe(2);
    expect(mocks.generateUserId).not.toHaveBeenCalled();
    expect(mocks.generateUserIdFromClientId).toHaveBeenNthCalledWith(1, "browser-alice", 42);
    expect(mocks.generateUserIdFromClientId).toHaveBeenNthCalledWith(2, "browser-bob", 42);
  });

  it("retains the existing anonymous replay session key", async () => {
    const service = new SessionReplayIngestService();

    await service.recordEvents(42, replayRequest(""), requestMeta);

    expect(mocks.generateUserId).toHaveBeenCalledWith(requestMeta.ipAddress, requestMeta.userAgent, 42);
    expect(mocks.updateSession).toHaveBeenCalledWith({
      userId: "shared-fingerprint",
      identifiedUserId: "",
      siteId: 42,
    });
  });

  it.each([
    ["v1", ["session_replay_events", "session_replay_metadata"], 1],
    ["dual", ["session_replay_events", "session_replay_metadata", "session_replay_metadata_v2"], 1],
    ["v2", ["session_replay_events", "session_replay_metadata_v2"], 0],
  ] as const)("writes the expected metadata tables in %s mode", async (mode, expectedTables, expectedReads) => {
    const service = new SessionReplayIngestService(mode);
    const request = replayRequest("employee-alice", "browser-alice");
    request.metadata = {
      pageUrl: "https://example.test/dashboard",
      viewportWidth: 1920,
      viewportHeight: 1080,
      language: "pl",
    };

    await service.recordEvents(42, request);

    expect(mocks.insert.mock.calls.map(call => call[0].table)).toEqual(expectedTables);
    expect(mocks.query).toHaveBeenCalledTimes(expectedReads);
  });
});
