import {
  clickhouseEffectiveUserId,
  clickhouseResolvedIdentifiedUserId,
} from "../../../db/clickhouse/identityDictionary.js";

/**
 * How a "user" is counted across analytics queries.
 *
 * `user_id` is an anonymous device fingerprint — sha256(bucketed IP + user agent).
 * It collides whenever visitors share an egress IP and a browser build (corporate
 * proxies, VPNs, Private Relay, CGNAT, managed fleets) and it splits whenever one
 * person uses two devices. `identified_user_id` is the stable ID the site passes to
 * `identify()`, so it is strictly better information wherever it is present.
 *
 * Every user-facing count therefore keys on the explicit event identity when there
 * is one, then on the PostgreSQL-backed alias dictionary used by Identity Resolution
 * v2, and falls back to the fingerprint otherwise. For sites without identity
 * mappings these expressions collapse to plain `user_id`.
 */

/**
 * Event-level key. Use when the query aggregates raw events and has no session
 * grain to resolve against.
 *
 * The alias dictionary also resolves history recorded before `identify()`. Until a
 * newly claimed alias reaches ClickHouse, those rows temporarily fall back to the
 * fingerprint. Prefer {@link EFFECTIVE_SESSION_USER_ID} when the query already
 * groups by session.
 */
export const effectiveUserId = (tableAlias = "") => {
  return clickhouseEffectiveUserId(tableAlias || undefined);
};

/**
 * Session-level key, for use inside a `GROUP BY session_id` aggregation.
 *
 * Sessions are keyed per identified user (see sessionsService.getSessionKey), so a
 * session's events resolve to one identity or remain anonymous. Taking any resolved
 * non-empty identity in the session avoids the pre-identify split. Pre-#1045 rows,
 * where several identities could share one anonymous session, resolve to whichever
 * identity the aggregate happens to see; that is no worse than the fingerprint they
 * resolve to today.
 */
const resolvedSessionIdentifiedUserId = clickhouseResolvedIdentifiedUserId();

export const EFFECTIVE_SESSION_USER_ID = `COALESCE(NULLIF(anyIf(${resolvedSessionIdentifiedUserId}, ${resolvedSessionIdentifiedUserId} != ''), ''), anyLast(user_id))`;

/**
 * Predicate for "these events belong to the user identified by `valueExpr`", where
 * the value may be either a custom user ID or an anonymous device fingerprint —
 * both appear in dashboard URLs and filters.
 *
 * The effective ID preserves explicit event-time identity, then applies the alias
 * dictionary, so one shared fingerprint cannot pull unrelated identified users into
 * an anonymous profile. See deleteUser for the equivalent predicate over a concrete
 * alias set.
 *
 * `valueExpr` must already be a bound parameter (`{userId:String}`) or an escaped
 * literal — it is interpolated verbatim.
 */
export const matchesUser = (valueExpr: string, tableAlias = "") => {
  return `${effectiveUserId(tableAlias)} = ${valueExpr}`;
};

/** Exact complement of {@link matchesUser}, so equals/not_equals filters partition the rows. */
export const doesNotMatchUser = (valueExpr: string, tableAlias = "") => `NOT ${matchesUser(valueExpr, tableAlias)}`;
