import crypto from "crypto";
import { nanoid } from "nanoid";
import { createServiceLogger } from "../../lib/logger/logger.js";
import {
  sessionGetOrCreate,
  sessionRedis,
  sessionResolveIdentified,
  type IdentifiedSessionResolutionStatus,
} from "../../db/redis/redis.js";

// Sessions expire after this much inactivity. Redis refreshes the TTL on every
// event (sliding window) and evicts the key automatically once it lapses — there
// is no table to scan and no cleanup cron to run.
const SESSION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_IDENTITY_CONTINUATION_GRACE_MS = 30_000;
const MAX_IDENTITY_CONTINUATION_GRACE_MS = 2 * 60 * 1000;

// Bounded in-process mirror of the last session id Redis handed back for each
// (siteId, session identity). It exists purely so a transient Redis failure can
// reuse the user's *real* session id instead of inventing a divergent one;
// otherwise a single timed-out command fractures one visitor into multiple sessions (events
// that reached Redis keep the real id while the failed event mints a new one).
// Entries slide on every touch and the map is capped LRU-style, so memory stays
// bounded by the active-user count.
const FALLBACK_CACHE_MAX = 50_000;

interface CachedSession {
  sessionId: string;
  expiresAt: number;
}

interface CachedSessionOwner {
  identityHash: string;
  expiresAt: number;
}

interface SessionsServiceOptions {
  identityContinuationGraceMs?: number;
}

export interface SessionResolution {
  sessionId: string;
  status: IdentifiedSessionResolutionStatus | "anonymous";
  continuationGapMs?: number;
}

export class SessionsService {
  private logger = createServiceLogger("sessions");
  private fallbackCache = new Map<string, CachedSession>();
  private fallbackOwners = new Map<string, CachedSessionOwner>();
  private identityContinuationGraceMs: number;

  constructor(options: SessionsServiceOptions = {}) {
    this.identityContinuationGraceMs = normalizeContinuationGraceMs(
      options.identityContinuationGraceMs ?? readContinuationGraceMs()
    );
  }

  private getAnonymousSessionKey(userId: string, siteId: number): string {
    return `session:${siteId}:${userId}`;
  }

  private getIdentityHash(userId: string, identifiedUserId: string): string {
    return crypto.createHash("sha256").update(userId).update("\0").update(identifiedUserId).digest("hex");
  }

  private getIdentifiedSessionKey(siteId: number, identityHash: string): string {
    return `session:${siteId}:identified:${identityHash}`;
  }

  private getSessionOwnerKey(userId: string, siteId: number): string {
    const browserHash = crypto.createHash("sha256").update(userId).digest("hex");
    return `session:${siteId}:identity-owner:${browserHash}`;
  }

  /**
   * Get the active session id for an anonymous or identified visitor identity,
   * creating one if none exists, and refresh its sliding 30-minute TTL. Backed
   * by Redis, with an in-process fallback so a Redis blip never drops — or
   * splits — a session.
   */
  async updateSession({
    userId,
    identifiedUserId,
    siteId,
  }: {
    userId: string;
    identifiedUserId?: string;
    siteId: number;
  }): Promise<SessionResolution> {
    const anonymousKey = this.getAnonymousSessionKey(userId, siteId);
    const candidate = nanoid(14);

    if (!identifiedUserId) {
      try {
        const sessionId = await sessionGetOrCreate(anonymousKey, candidate, SESSION_TTL_MS);
        this.rememberSession(anonymousKey, sessionId);
        return { sessionId, status: "anonymous" };
      } catch (error) {
        this.logger.error(error as Error, "Redis session lookup failed; using in-process fallback session id");
        return {
          sessionId: this.fallbackSessionId(anonymousKey, candidate),
          status: "anonymous",
        };
      }
    }

    const identityHash = this.getIdentityHash(userId, identifiedUserId);
    const identifiedKey = this.getIdentifiedSessionKey(siteId, identityHash);
    const ownerKey = this.getSessionOwnerKey(userId, siteId);

    try {
      const resolution = await sessionResolveIdentified(
        identifiedKey,
        anonymousKey,
        ownerKey,
        candidate,
        SESSION_TTL_MS,
        this.identityContinuationGraceMs,
        identityHash
      );
      this.rememberSession(identifiedKey, resolution.sessionId);
      if (resolution.ownerClaimed) {
        this.rememberOwner(ownerKey, identityHash);
      }
      if (resolution.status === "continued") {
        this.rememberSession(anonymousKey, resolution.sessionId);
        this.logger.debug(
          { siteId, continuationGapMs: resolution.continuationGapMs },
          "Continued identified session from recent anonymous activity"
        );
      } else if (resolution.status === "created-conflict") {
        this.logger.debug(
          { siteId },
          "Started a separate identified session because the browser identity is owned by another account"
        );
      } else if (resolution.status === "created-gap") {
        this.logger.debug(
          { siteId, continuationGapMs: resolution.continuationGapMs },
          "Started a separate identified session because the continuation window elapsed"
        );
      }

      return {
        sessionId: resolution.sessionId,
        status: resolution.status,
        ...(resolution.continuationGapMs === null ? {} : { continuationGapMs: resolution.continuationGapMs }),
      };
    } catch (error) {
      // A Redis blip must never drop ingestion — and must never split a session.
      this.logger.error(error as Error, "Redis session lookup failed; using in-process fallback session id");
      return this.resolveIdentifiedFallback({
        anonymousKey,
        identifiedKey,
        ownerKey,
        identityHash,
        candidate,
      });
    }
  }

  /** Cache the resolved session id with a fresh sliding expiry, LRU-bounded. */
  private rememberSession(key: string, sessionId: string): void {
    // Re-insert to mark as most-recently-used (Map preserves insertion order).
    this.fallbackCache.delete(key);
    this.fallbackCache.set(key, { sessionId, expiresAt: Date.now() + SESSION_TTL_MS });
    if (this.fallbackCache.size > FALLBACK_CACHE_MAX) {
      const oldest = this.fallbackCache.keys().next().value;
      if (oldest !== undefined) this.fallbackCache.delete(oldest);
    }
  }

  private rememberOwner(key: string, identityHash: string): void {
    this.fallbackOwners.delete(key);
    this.fallbackOwners.set(key, {
      identityHash,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    if (this.fallbackOwners.size > FALLBACK_CACHE_MAX) {
      const oldest = this.fallbackOwners.keys().next().value;
      if (oldest !== undefined) this.fallbackOwners.delete(oldest);
    }
  }

  /**
   * Resolve a session id without Redis. Reuses the last id seen for this user if
   * it's still within the sliding window (refreshing it), otherwise adopts
   * `candidate` as a new session. The result is stored back so subsequent events
   * during the same outage keep the same id — a per-worker stand-in for Redis
   * that stays stable across the 30-minute boundary instead of resetting on it.
   */
  private fallbackSessionId(key: string, candidate: string): string {
    const cached = this.fallbackCache.get(key);
    const sessionId = cached && cached.expiresAt > Date.now() ? cached.sessionId : candidate;
    this.rememberSession(key, sessionId);
    return sessionId;
  }

  private resolveIdentifiedFallback({
    anonymousKey,
    identifiedKey,
    ownerKey,
    identityHash,
    candidate,
  }: {
    anonymousKey: string;
    identifiedKey: string;
    ownerKey: string;
    identityHash: string;
    candidate: string;
  }): SessionResolution {
    const now = Date.now();
    const identifiedSession = this.fallbackCache.get(identifiedKey);
    if (identifiedSession && identifiedSession.expiresAt > now) {
      this.rememberSession(identifiedKey, identifiedSession.sessionId);
      return { sessionId: identifiedSession.sessionId, status: "existing" };
    }

    const owner = this.fallbackOwners.get(ownerKey);
    const activeOwner = owner && owner.expiresAt > now ? owner : undefined;
    const anonymousSession = this.fallbackCache.get(anonymousKey);
    const continuationGapMs = anonymousSession ? Math.max(0, now + SESSION_TTL_MS - anonymousSession.expiresAt) : null;
    const canContinue =
      this.identityContinuationGraceMs > 0 &&
      anonymousSession !== undefined &&
      anonymousSession.expiresAt > now &&
      continuationGapMs !== null &&
      continuationGapMs <= this.identityContinuationGraceMs &&
      (!activeOwner || activeOwner.identityHash === identityHash);

    const sessionId = canContinue ? anonymousSession.sessionId : candidate;
    const status: IdentifiedSessionResolutionStatus = canContinue
      ? "continued"
      : activeOwner && activeOwner.identityHash !== identityHash
        ? "created-conflict"
        : anonymousSession
          ? "created-gap"
          : "created";

    this.rememberSession(identifiedKey, sessionId);
    if (!activeOwner || activeOwner.identityHash === identityHash) {
      this.rememberOwner(ownerKey, identityHash);
    }
    if (canContinue) {
      this.rememberSession(anonymousKey, sessionId);
    }

    return {
      sessionId,
      status,
      ...(continuationGapMs === null ? {} : { continuationGapMs }),
    };
  }

  /** Close the dedicated session Redis connection during graceful shutdown. */
  async close(): Promise<void> {
    try {
      await sessionRedis.quit();
    } catch (error) {
      this.logger.error(error as Error, "Error closing Redis connection");
    }
  }
}

export const sessionsService = new SessionsService();

function readContinuationGraceMs(): number {
  const configured = process.env.SESSION_IDENTITY_CONTINUATION_GRACE_MS;
  if (configured === undefined || configured.trim() === "") {
    return DEFAULT_IDENTITY_CONTINUATION_GRACE_MS;
  }

  const parsed = Number(configured);
  return Number.isFinite(parsed) ? parsed : DEFAULT_IDENTITY_CONTINUATION_GRACE_MS;
}

function normalizeContinuationGraceMs(value: number): number {
  return Math.min(MAX_IDENTITY_CONTINUATION_GRACE_MS, Math.max(0, Math.round(value)));
}
