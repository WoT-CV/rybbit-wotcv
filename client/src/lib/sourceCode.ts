const SOURCE_REPOSITORY_URL = "https://github.com/WoT-CV/rybbit-wotcv";
const FALLBACK_SOURCE_REVISION = "feat/wotcv";

const buildRevision = process.env.NEXT_PUBLIC_WOTCV_GIT_SHA?.trim();

export const sourceRevision =
  buildRevision && /^[0-9a-f]{7,40}$/i.test(buildRevision) ? buildRevision : FALLBACK_SOURCE_REVISION;

export const sourceCodeUrl = `${SOURCE_REPOSITORY_URL}/tree/${sourceRevision}`;
export const sourceLicenseUrl = `${SOURCE_REPOSITORY_URL}/blob/${sourceRevision}/LICENSE.md`;
