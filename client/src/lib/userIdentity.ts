import { generateName } from "./avatar";

export type UserIdentityLike = {
  user_id?: string | null;
  identified_user_id?: string | null;
  traits?: Record<string, unknown> | null;
  linked_devices?: Array<{ anonymous_id?: string | null }>;
};

export interface ResolvedUserIdentity {
  avatarId: string;
  avatarUrl?: string;
  displayName: string;
}

const DISPLAY_NAME_TRAIT_KEYS = ["username", "name", "email"] as const;
const AVATAR_TRAIT_KEYS = ["avatarUrl", "logoUrl", "imageUrl", "avatar_url", "picture"] as const;

function getTraitString(traits: Record<string, unknown> | null | undefined, key: string) {
  const value = traits?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isSafeAvatarUrl(value: string | undefined) {
  if (!value || value.length > 2048) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function getUserAvatarUrl(data: UserIdentityLike | null | undefined) {
  for (const key of AVATAR_TRAIT_KEYS) {
    const value = getTraitString(data?.traits, key);
    if (isSafeAvatarUrl(value)) return value;
  }

  return undefined;
}

export function getCanonicalUserId(data: UserIdentityLike | null | undefined) {
  return data?.identified_user_id || data?.user_id || "";
}

export function getUserIdentityIds(data: UserIdentityLike | null | undefined) {
  return [getCanonicalUserId(data), ...(data?.linked_devices?.map(device => device.anonymous_id) ?? [])].filter(
    (id, index, ids): id is string => !!id && ids.indexOf(id) === index
  );
}

export function getUserDisplayName(data: UserIdentityLike | null | undefined) {
  for (const key of DISPLAY_NAME_TRAIT_KEYS) {
    const value = getTraitString(data?.traits, key);
    if (value) return value;
  }

  if (data?.identified_user_id) return data.identified_user_id;
  return generateName(data?.user_id || "");
}

export function getUserAvatarId(data: UserIdentityLike | null | undefined) {
  return getCanonicalUserId(data);
}

export function resolveUserIdentity(data: UserIdentityLike | null | undefined): ResolvedUserIdentity {
  return {
    avatarId: getUserAvatarId(data),
    avatarUrl: getUserAvatarUrl(data),
    displayName: getUserDisplayName(data),
  };
}

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeHtmlAttribute(value: string | number | null | undefined) {
  return escapeHtml(value);
}
