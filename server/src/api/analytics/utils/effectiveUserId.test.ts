import { describe, expect, it } from "vitest";
import { doesNotMatchUser, EFFECTIVE_SESSION_USER_ID, effectiveUserId, matchesUser } from "./effectiveUserId.js";

function resolvedIdentity(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return `if(${prefix}identified_user_id != '', ${prefix}identified_user_id, dictGetOrDefault('user_identity_dict', 'user_id', tuple(toUInt64(${prefix}site_id), toString(${prefix}user_id)), ''))`;
}

function effectiveIdentity(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  const resolved = resolvedIdentity(alias);
  return `if(${resolved} != '', ${resolved}, ${prefix}user_id)`;
}

describe("effectiveUserId", () => {
  it("prefers explicit identity, then the alias dictionary, then the fingerprint", () => {
    expect(effectiveUserId()).toBe(effectiveIdentity());
    expect(effectiveUserId()).toContain("identified_user_id != ''");
    expect(effectiveUserId()).toContain("dictGetOrDefault('user_identity_dict'");
    expect(effectiveUserId()).toContain("tuple(toUInt64(site_id), toString(user_id))");
    expect(effectiveUserId().endsWith(", user_id)")).toBe(true);
  });

  it("treats an empty alias as no alias", () => {
    expect(effectiveUserId("")).toBe(effectiveIdentity());
  });

  it.each(["e", "events", "db.events"])("prefixes every identity column with alias %s", alias => {
    expect(effectiveUserId(alias)).toBe(effectiveIdentity(alias));
  });

  it("does not generate a mutation-driven identity expression", () => {
    expect(effectiveUserId()).not.toContain("ALTER TABLE");
    expect(effectiveUserId()).not.toContain("UPDATE");
  });
});

describe("EFFECTIVE_SESSION_USER_ID", () => {
  it("aggregates the same dictionary-resolved identity at session grain", () => {
    const resolved = resolvedIdentity();
    expect(EFFECTIVE_SESSION_USER_ID).toBe(
      `COALESCE(NULLIF(anyIf(${resolved}, ${resolved} != ''), ''), anyLast(user_id))`
    );
  });

  it("falls back to the session fingerprint when no identity resolves", () => {
    expect(EFFECTIVE_SESSION_USER_ID).toContain("anyLast(user_id)");
    expect(EFFECTIVE_SESSION_USER_ID).toContain("user_identity_dict");
  });

  it("is a constant for an unaliased events scan", () => {
    expect(typeof EFFECTIVE_SESSION_USER_ID).toBe("string");
    expect(EFFECTIVE_SESSION_USER_ID).not.toContain("events.");
  });
});

describe("matchesUser", () => {
  it("matches the dictionary-resolved effective identity", () => {
    expect(matchesUser("{userId:String}")).toBe(`${effectiveIdentity()} = {userId:String}`);
  });

  it("treats an empty alias as no alias", () => {
    expect(matchesUser("{userId:String}", "")).toBe(matchesUser("{userId:String}"));
  });

  it("prefixes only column references, never the bound value", () => {
    const sql = matchesUser("{userId:String}", "e");
    expect(sql).toBe(`${effectiveIdentity("e")} = {userId:String}`);
    expect(sql).not.toContain("e.{userId:String}");
    expect(sql.match(/\{userId:String\}/g)).toHaveLength(1);
  });

  it("interpolates an already escaped literal verbatim", () => {
    expect(matchesUser("'user123'")).toBe(`${effectiveIdentity()} = 'user123'`);
  });
});

describe("doesNotMatchUser", () => {
  it("is the exact complement of matchesUser", () => {
    for (const alias of ["", "e", "events"]) {
      expect(doesNotMatchUser("{userId:String}", alias)).toBe(`NOT ${matchesUser("{userId:String}", alias)}`);
    }
  });

  it("negates the complete equality expression", () => {
    expect(doesNotMatchUser("'user123'")).toBe(`NOT ${effectiveIdentity()} = 'user123'`);
  });
});
