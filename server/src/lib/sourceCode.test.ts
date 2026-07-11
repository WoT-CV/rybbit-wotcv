import { afterEach, describe, expect, it } from "vitest";
import { getSourceCodeUrl } from "./sourceCode.js";

const originalRepositoryUrl = process.env.WOTCV_SOURCE_REPOSITORY_URL;
const originalGitSha = process.env.WOTCV_GIT_SHA;

afterEach(() => {
  if (originalRepositoryUrl === undefined) delete process.env.WOTCV_SOURCE_REPOSITORY_URL;
  else process.env.WOTCV_SOURCE_REPOSITORY_URL = originalRepositoryUrl;

  if (originalGitSha === undefined) delete process.env.WOTCV_GIT_SHA;
  else process.env.WOTCV_GIT_SHA = originalGitSha;
});

describe("getSourceCodeUrl", () => {
  it("links a build to its immutable commit", () => {
    process.env.WOTCV_GIT_SHA = "0123456789abcdef0123456789abcdef01234567";

    expect(getSourceCodeUrl()).toBe(
      "https://github.com/WoT-CV/rybbit-wotcv/tree/0123456789abcdef0123456789abcdef01234567",
    );
  });

  it("uses the maintained branch when build metadata is unavailable", () => {
    delete process.env.WOTCV_GIT_SHA;

    expect(getSourceCodeUrl()).toBe("https://github.com/WoT-CV/rybbit-wotcv/tree/feat/wotcv");
  });

  it("rejects invalid revisions and normalizes a repository override", () => {
    process.env.WOTCV_GIT_SHA = "not-a-git-sha";
    process.env.WOTCV_SOURCE_REPOSITORY_URL = "https://git.example.com/wotcv/rybbit///";

    expect(getSourceCodeUrl()).toBe("https://git.example.com/wotcv/rybbit/tree/feat/wotcv");
  });
});
