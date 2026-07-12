import { IS_CLOUD } from "./const.js";

const hasValue = (value: string | undefined): boolean => Boolean(value?.trim());

export interface RuntimeCapabilities {
  googleSearchConsole: boolean;
  objectStorage: boolean;
  socialProviders: {
    github: boolean;
    google: boolean;
  };
  transactionalEmail: boolean;
  turnstile: boolean;
  weeklyReports: boolean;
}

export function getRuntimeCapabilities(
  env: NodeJS.ProcessEnv = process.env,
  isCloud: boolean = IS_CLOUD
): RuntimeCapabilities {
  const googleConfigured = hasValue(env.GOOGLE_CLIENT_ID) && hasValue(env.GOOGLE_CLIENT_SECRET);
  const transactionalEmail = hasValue(env.RESEND_API_KEY) && (isCloud || hasValue(env.EMAIL_FROM));

  return {
    googleSearchConsole: googleConfigured && (hasValue(env.GOOGLE_REDIRECT_URI) || hasValue(env.BASE_URL)),
    objectStorage: hasValue(env.R2_ACCOUNT_ID) && hasValue(env.R2_ACCESS_KEY_ID) && hasValue(env.R2_SECRET_ACCESS_KEY),
    socialProviders: {
      github: hasValue(env.GITHUB_CLIENT_ID) && hasValue(env.GITHUB_CLIENT_SECRET),
      google: googleConfigured,
    },
    transactionalEmail,
    turnstile: hasValue(env.TURNSTILE_SECRET_KEY) && hasValue(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
    weeklyReports: transactionalEmail && (isCloud || env.ENABLE_WEEKLY_REPORTS === "true"),
  };
}

export const runtimeCapabilities = getRuntimeCapabilities();
