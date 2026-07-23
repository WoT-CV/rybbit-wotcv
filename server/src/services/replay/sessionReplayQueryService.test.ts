import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../db/clickhouse/clickhouse.js", () => ({
  clickhouse: {
    query: mocks.query,
  },
}));

vi.mock("../storage/r2StorageService.js", () => ({
  r2Storage: {
    isEnabled: () => false,
  },
}));

vi.mock("../userIdentity/userIdentityService.js", () => ({
  clickhouseEffectiveUserId: () => "user_id",
  clickhouseResolvedIdentifiedUserId: () => "identified_user_id",
  resolveUserIdentity: vi.fn(),
}));

import { SessionReplayQueryService } from "./sessionReplayQueryService.js";

function resultSet(rows: unknown[]) {
  return {
    json: vi.fn().mockResolvedValue(rows),
  };
}

function clickhouseEvent({
  timestamp,
  type,
  sequenceNumber,
  data,
}: {
  timestamp: number;
  type: number;
  sequenceNumber: number;
  data: Record<string, unknown>;
}) {
  return {
    timestamp,
    type: String(type),
    data: JSON.stringify(data),
    event_data_key: null,
    batch_index: null,
    sequence_number: sequenceNumber,
  };
}

describe("SessionReplayQueryService continued recordings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orders two document recordings chronologically even when rrweb sequence numbers restart", async () => {
    mocks.query
      .mockResolvedValueOnce(
        resultSet([
          {
            session_id: "continued-session",
            user_id: "browser-fingerprint",
            identified_user_id: "employee-alice",
          },
        ])
      )
      .mockResolvedValueOnce(
        resultSet([
          clickhouseEvent({
            timestamp: 6_001,
            type: 2,
            sequenceNumber: 1,
            data: { fragment: "identified-snapshot" },
          }),
          clickhouseEvent({
            timestamp: 1_001,
            type: 2,
            sequenceNumber: 1,
            data: { fragment: "anonymous-snapshot" },
          }),
          clickhouseEvent({
            timestamp: 6_000,
            type: 4,
            sequenceNumber: 0,
            data: { href: "https://wot-cv.com/players-to-check" },
          }),
          clickhouseEvent({
            timestamp: 1_000,
            type: 4,
            sequenceNumber: 0,
            data: { href: "https://wot-cv.com/login" },
          }),
        ])
      );

    const response = await new SessionReplayQueryService().getSessionReplayEvents(42, "continued-session");

    expect(response.metadata).toMatchObject({
      session_id: "continued-session",
      identified_user_id: "employee-alice",
    });
    expect(response.events).toEqual([
      {
        timestamp: 1_000,
        type: 4,
        data: { href: "https://wot-cv.com/login" },
      },
      {
        timestamp: 1_001,
        type: 2,
        data: { fragment: "anonymous-snapshot" },
      },
      {
        timestamp: 6_000,
        type: 4,
        data: { href: "https://wot-cv.com/players-to-check" },
      },
      {
        timestamp: 6_001,
        type: 2,
        data: { fragment: "identified-snapshot" },
      },
    ]);
  });
});
