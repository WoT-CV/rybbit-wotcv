import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/postgres/postgres.js";
import { userAliases } from "../../db/postgres/schema.js";
export {
  clickhouseEffectiveUserId,
  clickhouseResolvedIdentifiedUserId,
  clickhouseResolvedUserCondition,
} from "../../db/clickhouse/identityDictionary.js";

export interface ResolvedUserIdentity {
  canonicalUserId: string;
  anonymousIds: string[];
}

export type TrackerAliasClaim = { status: "created" | "existing" } | { status: "conflict"; existingUserId: string };

/**
 * Claims an anonymous browser identifier for the tracker without ever moving
 * history that already belongs to another account. The unique constraint on
 * (site_id, anonymous_id) closes the race between concurrent identify calls.
 */
async function claimAlias(
  siteId: number,
  anonymousId: string,
  userId: string,
  source: "tracker" | "legacy"
): Promise<TrackerAliasClaim> {
  const existing = await db
    .select({ userId: userAliases.userId })
    .from(userAliases)
    .where(and(eq(userAliases.siteId, siteId), eq(userAliases.anonymousId, anonymousId)))
    .limit(1);

  if (existing[0]) {
    return existing[0].userId === userId
      ? { status: "existing" }
      : { status: "conflict", existingUserId: existing[0].userId };
  }

  const inserted = await db
    .insert(userAliases)
    .values({ siteId, anonymousId, userId, source })
    .onConflictDoNothing()
    .returning({ userId: userAliases.userId });

  if (inserted[0]) {
    return { status: "created" };
  }

  // Another request won the insert race. Re-read the owner and apply the same
  // no-stealing rule as above.
  const winner = await db
    .select({ userId: userAliases.userId })
    .from(userAliases)
    .where(and(eq(userAliases.siteId, siteId), eq(userAliases.anonymousId, anonymousId)))
    .limit(1);

  if (!winner[0]) {
    throw new Error("Alias claim lost without a persisted winner");
  }

  return winner[0].userId === userId
    ? { status: "existing" }
    : { status: "conflict", existingUserId: winner[0].userId };
}

export function claimTrackerAlias(siteId: number, anonymousId: string, userId: string): Promise<TrackerAliasClaim> {
  return claimAlias(siteId, anonymousId, userId, "tracker");
}

export function claimLegacyClientAlias(
  siteId: number,
  anonymousId: string,
  userId: string
): Promise<TrackerAliasClaim> {
  return claimAlias(siteId, anonymousId, userId, "legacy");
}

/**
 * Dashboard operators may intentionally correct an identity assignment. This
 * is the only path allowed to reassign an existing alias.
 */
export async function assignAdminAlias(siteId: number, anonymousId: string, userId: string): Promise<void> {
  await db
    .insert(userAliases)
    .values({ siteId, anonymousId, userId, source: "admin" })
    .onConflictDoUpdate({
      target: [userAliases.siteId, userAliases.anonymousId],
      set: {
        userId,
        source: "admin",
        updatedAt: sql`now()`,
      },
    });
}

export async function resolveUserIdentity(siteId: number, requestedUserId: string): Promise<ResolvedUserIdentity> {
  const directAlias = await db
    .select({ userId: userAliases.userId })
    .from(userAliases)
    .where(and(eq(userAliases.siteId, siteId), eq(userAliases.anonymousId, requestedUserId)))
    .limit(1);

  const canonicalUserId = directAlias[0]?.userId ?? requestedUserId;
  const linkedAliases = await db
    .select({ anonymousId: userAliases.anonymousId })
    .from(userAliases)
    .where(and(eq(userAliases.siteId, siteId), eq(userAliases.userId, canonicalUserId)));

  return {
    canonicalUserId,
    anonymousIds: [...new Set(linkedAliases.map(alias => alias.anonymousId))],
  };
}
