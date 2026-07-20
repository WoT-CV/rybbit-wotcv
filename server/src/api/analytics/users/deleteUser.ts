import { FastifyReply, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { clickhouse } from "../../../db/clickhouse/clickhouse.js";
import { db } from "../../../db/postgres/postgres.js";
import { userAliases, userProfiles } from "../../../db/postgres/schema.js";
import { r2Storage } from "../../../services/storage/r2StorageService.js";
import {
  clickhouseResolvedUserCondition,
  resolveUserIdentity,
} from "../../../services/userIdentity/userIdentityService.js";
import { processResults } from "../utils/utils.js";

export interface DeleteUserRequest {
  Params: {
    siteId: string;
    userId: string;
  };
}

/**
 * GDPR erasure: permanently delete all analytics data for a user — events,
 * session replays (including R2-stored payloads), profile, and aliases.
 * Accepts either an identified user ID or an anonymous device fingerprint.
 *
 * Events a linked device produced while identified as a DIFFERENT user are
 * preserved (shared-device case): device-scoped deletion only applies to
 * unattributed events.
 */
export async function deleteUser(req: FastifyRequest<DeleteUserRequest>, res: FastifyReply) {
  const { userId } = req.params;
  const siteId = Number(req.params.siteId);

  try {
    const identity = await resolveUserIdentity(siteId, userId);
    const canonicalUserId = identity.canonicalUserId;
    const anonymousIds = [...new Set([userId, ...identity.anonymousIds])];

    const userCondition = `site_id = {siteId:UInt16}
      AND ${clickhouseResolvedUserCondition(undefined, "canonicalUserId", "anonymousIds")}`;
    const queryParams = { siteId, canonicalUserId, anonymousIds };

    // Delete R2-stored replay payloads first (cloud deployments); best-effort —
    // proceed with ClickHouse deletion even if R2 cleanup fails.
    if (r2Storage.isEnabled()) {
      try {
        const r2KeysResult = await clickhouse.query({
          query: `
            SELECT DISTINCT event_data_key
            FROM session_replay_events
            WHERE ${userCondition}
              AND event_data_key IS NOT NULL
          `,
          query_params: queryParams,
          format: "JSONEachRow",
        });
        const r2Keys = await processResults<{ event_data_key: string }>(r2KeysResult);
        await Promise.all(r2Keys.map(row => r2Storage.deleteBatch(row.event_data_key)));
      } catch (error) {
        req.log.error({ err: error, canonicalUserId }, "Failed to delete R2 replay data for user");
      }
    }

    await Promise.all(
      ["events", "session_replay_events", "session_replay_metadata"].map(table =>
        clickhouse.command({
          query: `DELETE FROM ${table} WHERE ${userCondition}`,
          query_params: queryParams,
        })
      )
    );

    await Promise.all([
      db.delete(userProfiles).where(and(eq(userProfiles.siteId, siteId), eq(userProfiles.userId, canonicalUserId))),
      db.delete(userAliases).where(and(eq(userAliases.siteId, siteId), eq(userAliases.userId, canonicalUserId))),
    ]);

    return res.send({ success: true });
  } catch (error) {
    req.log.error({ err: error }, "Error deleting user");
    return res.status(500).send({ error: "Failed to delete user" });
  }
}
