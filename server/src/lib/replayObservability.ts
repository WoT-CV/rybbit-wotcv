import type { ReplayObservabilityProfile } from "@rybbit/shared";
import { z } from "zod";

const httpsUrl = z
  .string()
  .max(2048)
  .url()
  .refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  });
const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._-]+$/);
const profileSchema = z
  .object({
    siteIds: z.array(z.number().int().positive()).min(1).max(100),
    requestOrigin: httpsUrl.refine(value => new URL(value).pathname === "/").transform(value => new URL(value).origin),
    grafanaUrl: httpsUrl.transform(value => value.replace(/\/$/, "")),
    orgId: z.number().int().positive(),
    lokiDatasourceUid: identifier,
    tempoDatasourceUid: identifier.optional(),
    serviceName: identifier,
    environment: identifier,
    timePaddingMs: z.number().int().min(0).max(3_600_000).default(120_000),
  })
  .strict();

// Non-secret production identifiers, scoped to the WoT-CV site and API origin.
// An explicit JSON configuration replaces these defaults; [] disables the links.
const WOTCV_REPLAY_OBSERVABILITY_PROFILES = [
  {
    siteIds: [2],
    requestOrigin: "https://api.wot-cv.com",
    grafanaUrl: "https://dashboard.wot-cv.com",
    orgId: 1,
    lokiDatasourceUid: "bet3mn133whkwd",
    tempoDatasourceUid: "df0rqhtz9e3uoa",
    serviceName: "wot-cv-be-prod",
    environment: "prod",
    timePaddingMs: 120_000,
  },
] satisfies z.input<typeof profileSchema>[];

export function parseReplayObservabilityProfiles(
  value: string | undefined,
  siteId: number
): ReplayObservabilityProfile[] {
  if (value && value.length > 65_536) throw new Error("Replay observability configuration exceeds its limit");
  const configuration = value?.trim() ? JSON.parse(value) : WOTCV_REPLAY_OBSERVABILITY_PROFILES;
  const profiles = z.array(profileSchema).max(100).parse(configuration);
  const origins = new Set<string>();
  return profiles
    .filter(profile => profile.siteIds.includes(siteId))
    .map(({ siteIds: _siteIds, ...profile }) => {
      if (origins.has(profile.requestOrigin)) throw new Error("Ambiguous replay observability origin");
      origins.add(profile.requestOrigin);
      return profile;
    });
}
