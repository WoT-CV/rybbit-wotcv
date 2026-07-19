import { getLocation } from "../../db/geolocation/geolocation.js";
import { matchesCIDR, matchesRange } from "../../lib/ipUtils.js";
import { logger } from "../../lib/logger/logger.js";
import type { SiteConfigData } from "../../lib/siteConfig.js";

type SiteExclusionConfiguration = Pick<
  SiteConfigData,
  "excludedIPs" | "excludedCountries" | "excludedPaths" | "excludedHostnames" | "excludedUserAgents"
>;

export type SiteExclusionRequest = {
  ipAddress: string;
  pathname?: string;
  hostname?: string;
  userAgent?: string;
};

export type SiteExclusionReason = "ip" | "country" | "path" | "hostname" | "user_agent";

export type SiteExclusionDecision =
  | { excluded: false }
  | {
      excluded: true;
      reason: SiteExclusionReason;
      label: "IP" | "country" | "path" | "hostname" | "user agent";
      value: string;
    };

const ACCEPTED: SiteExclusionDecision = { excluded: false };

function excluded(
  reason: SiteExclusionReason,
  label: "IP" | "country" | "path" | "hostname" | "user agent",
  value: string
): SiteExclusionDecision {
  return { excluded: true, reason, label, value };
}

function matchesGlob(value: string, pattern: string): boolean {
  const glob = pattern.trim().toLowerCase();
  if (!glob) return false;

  const text = value.toLowerCase();
  let textIndex = 0;
  let globIndex = 0;
  let lastStarGlobIndex = -1;
  let textIndexAfterStar = 0;

  while (textIndex < text.length) {
    if (globIndex < glob.length && glob[globIndex] === text[textIndex]) {
      textIndex++;
      globIndex++;
    } else if (globIndex < glob.length && glob[globIndex] === "*") {
      lastStarGlobIndex = globIndex;
      textIndexAfterStar = textIndex;
      globIndex++;
    } else if (lastStarGlobIndex !== -1) {
      globIndex = lastStarGlobIndex + 1;
      textIndexAfterStar++;
      textIndex = textIndexAfterStar;
    } else {
      return false;
    }
  }

  while (globIndex < glob.length && glob[globIndex] === "*") {
    globIndex++;
  }

  return globIndex === glob.length;
}

function matchesIPPattern(ipAddress: string, pattern: string): boolean {
  try {
    const trimmedPattern = pattern.trim();

    if (!trimmedPattern.includes("/") && !trimmedPattern.includes("-")) {
      return ipAddress === trimmedPattern;
    }

    if (trimmedPattern.includes("/")) {
      return matchesCIDR(ipAddress, trimmedPattern);
    }

    if (trimmedPattern.includes("-")) {
      return matchesRange(ipAddress, trimmedPattern);
    }

    return false;
  } catch (error) {
    logger.warn(error as Error, `Invalid IP pattern: ${pattern}`);
    return false;
  }
}

/**
 * Returns the first Site Configuration exclusion matched in this fixed order:
 * IP, country, path, hostname, then user agent.
 *
 * Geolocation is resolved only when country exclusions exist and no earlier
 * exclusion matched. Lookup failures from the geolocation adapter propagate.
 */
export async function decideSiteExclusion(
  configuration: SiteExclusionConfiguration,
  request: SiteExclusionRequest
): Promise<SiteExclusionDecision> {
  if (configuration.excludedIPs.some(pattern => matchesIPPattern(request.ipAddress, pattern))) {
    return excluded("ip", "IP", request.ipAddress);
  }

  if (configuration.excludedCountries.length > 0) {
    const locations = await getLocation([request.ipAddress]);
    const countryIso = locations[request.ipAddress]?.countryIso;

    if (
      countryIso &&
      configuration.excludedCountries.some(country => country.toUpperCase() === countryIso.toUpperCase())
    ) {
      return excluded("country", "country", countryIso);
    }
  }

  const { pathname, hostname, userAgent } = request;

  if (pathname && configuration.excludedPaths.some(pattern => matchesGlob(pathname, pattern))) {
    return excluded("path", "path", pathname);
  }

  if (hostname && configuration.excludedHostnames.some(pattern => matchesGlob(hostname, pattern))) {
    return excluded("hostname", "hostname", hostname);
  }

  if (userAgent) {
    const normalizedUserAgent = userAgent.toLowerCase();
    const matchesUserAgent = configuration.excludedUserAgents.some(substring => {
      const trimmed = substring.trim().toLowerCase();
      return trimmed.length > 0 && normalizedUserAgent.includes(trimmed);
    });

    if (matchesUserAgent) {
      return excluded("user_agent", "user agent", userAgent);
    }
  }

  return ACCEPTED;
}
