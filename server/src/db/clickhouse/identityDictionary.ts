import { IDENTITY_RESOLUTION_V2 } from "../../lib/const.js";

export const USER_IDENTITY_DICTIONARY = "user_identity_dict";

function column(tableAlias: string | undefined, name: string): string {
  return tableAlias ? `${tableAlias}.${name}` : name;
}

/**
 * Resolve the account associated with an event without mutating the immutable
 * ClickHouse fact tables. Explicit event-time identity always wins; the
 * PostgreSQL-backed dictionary is used only for pre-identification history.
 */
export function clickhouseResolvedIdentifiedUserId(tableAlias?: string): string {
  const identifiedUserId = column(tableAlias, "identified_user_id");
  if (!IDENTITY_RESOLUTION_V2) {
    return identifiedUserId;
  }

  const siteId = column(tableAlias, "site_id");
  const anonymousId = column(tableAlias, "user_id");
  const dictionaryLookup = `dictGetOrDefault('${USER_IDENTITY_DICTIONARY}', 'user_id', tuple(toUInt64(${siteId}), toString(${anonymousId})), '')`;

  return `if(${identifiedUserId} != '', ${identifiedUserId}, ${dictionaryLookup})`;
}

export function clickhouseEffectiveUserId(tableAlias?: string): string {
  const anonymousId = column(tableAlias, "user_id");
  const resolvedIdentifiedUserId = clickhouseResolvedIdentifiedUserId(tableAlias);
  return `if(${resolvedIdentifiedUserId} != '', ${resolvedIdentifiedUserId}, ${anonymousId})`;
}

/**
 * Match the concrete identity already resolved from PostgreSQL. This form is
 * used by single-user reads and erasure, where waiting for the external
 * dictionary refresh would make a freshly claimed alias temporarily disappear.
 *
 * Explicit event-time identity still wins: an event attributed to a different
 * account is never pulled in merely because the browser ID was later linked or
 * administratively reassigned.
 */
export function clickhouseResolvedUserCondition(
  tableAlias?: string,
  canonicalUserIdParam = "canonicalUserId",
  anonymousIdsParam = "anonymousIds"
): string {
  const identifiedUserId = column(tableAlias, "identified_user_id");
  const anonymousId = column(tableAlias, "user_id");

  return `(
    ${identifiedUserId} = {${canonicalUserIdParam}:String}
    OR (
      ${identifiedUserId} = ''
      AND (
        ${anonymousId} = {${canonicalUserIdParam}:String}
        OR ${anonymousId} IN ({${anonymousIdsParam}:Array(String)})
      )
    )
  )`;
}
