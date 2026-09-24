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

export function parseReplayObservabilityProfiles(
  value: string | undefined,
  siteId: number
): ReplayObservabilityProfile[] {
  if (!value?.trim()) return [];
  if (value.length > 65_536) throw new Error("Replay observability configuration exceeds its limit");
  const profiles = z.array(profileSchema).max(100).parse(JSON.parse(value));
  const origins = new Set<string>();
  return profiles
    .filter(profile => profile.siteIds.includes(siteId))
    .map(({ siteIds: _siteIds, ...profile }) => {
      if (origins.has(profile.requestOrigin)) throw new Error("Ambiguous replay observability origin");
      origins.add(profile.requestOrigin);
      return profile;
    });
}
