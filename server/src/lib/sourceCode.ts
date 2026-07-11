const DEFAULT_SOURCE_REPOSITORY_URL = "https://github.com/WoT-CV/rybbit-wotcv";
const FALLBACK_SOURCE_REVISION = "feat/wotcv";

export function getSourceCodeUrl() {
  const repositoryUrl = (process.env.WOTCV_SOURCE_REPOSITORY_URL || DEFAULT_SOURCE_REPOSITORY_URL).replace(/\/+$/, "");
  const gitSha = process.env.WOTCV_GIT_SHA?.trim();
  const revision = gitSha && /^[0-9a-f]{7,40}$/i.test(gitSha) ? gitSha : FALLBACK_SOURCE_REVISION;

  return `${repositoryUrl}/tree/${revision}`;
}
