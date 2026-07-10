export interface BuildMetadata {
  status: "ok";
  version: string;
  gitSha: string;
  imageTag: string;
  imageDigest: string;
  buildTime: string;
  deployedAt: string;
}

export function getBuildMetadata(): BuildMetadata {
  return {
    status: "ok",
    version: process.env.WOTCV_VERSION || "wotcv",
    gitSha: process.env.WOTCV_GIT_SHA || "unknown",
    imageTag: process.env.WOTCV_IMAGE_TAG || "unknown",
    imageDigest: process.env.WOTCV_IMAGE_DIGEST || "unknown",
    buildTime: process.env.WOTCV_BUILD_TIME || "unknown",
    deployedAt: process.env.WOTCV_DEPLOYED_AT || "unknown",
  };
}
