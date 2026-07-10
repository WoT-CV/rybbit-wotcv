#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_BRANCH="${WOTCV_TARGET_BRANCH:-master}"
FORK_REMOTE="${WOTCV_FORK_REMOTE:-origin}"
UPSTREAM_REMOTE="${WOTCV_UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${WOTCV_UPSTREAM_URL:-https://github.com/rybbit-io/rybbit.git}"
UPSTREAM_BRANCH="${WOTCV_UPSTREAM_BRANCH:-master}"
PUSH_CHANGES="${WOTCV_PUSH:-0}"

cd "${ROOT_DIR}"

command -v git >/dev/null 2>&1 || { echo "git is required." >&2; exit 1; }

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean before syncing upstream." >&2
  exit 1
fi

if ! git remote get-url "${UPSTREAM_REMOTE}" >/dev/null 2>&1; then
  git remote add "${UPSTREAM_REMOTE}" "${UPSTREAM_URL}"
fi

git fetch "${FORK_REMOTE}" --prune
git fetch "${UPSTREAM_REMOTE}" --prune

if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
  git switch "${TARGET_BRANCH}"
else
  git switch --track -c "${TARGET_BRANCH}" "${FORK_REMOTE}/${TARGET_BRANCH}"
fi

git merge --ff-only "${FORK_REMOTE}/${TARGET_BRANCH}"

BACKUP_BRANCH="backup/${TARGET_BRANCH}-before-upstream-$(date -u +%Y%m%dT%H%M%SZ)"
git branch "${BACKUP_BRANCH}"

echo "Merging ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} into ${TARGET_BRANCH}..."
if ! git merge --no-ff "${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}" -m "chore: sync ${TARGET_BRANCH} with ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"; then
  echo "Upstream merge has conflicts." >&2
  echo "Resolve conflicts, run validation, then commit the merge." >&2
  echo "Backup branch: ${BACKUP_BRANCH}" >&2
  exit 1
fi

echo "Upstream sync completed."
echo "Target branch: ${TARGET_BRANCH}"
echo "Upstream source: ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
echo "Backup branch: ${BACKUP_BRANCH}"
echo "Result SHA: $(git rev-parse HEAD)"

if [[ "${PUSH_CHANGES}" == "1" ]]; then
  git push "${FORK_REMOTE}" "${TARGET_BRANCH}"
  echo "Pushed ${TARGET_BRANCH} to ${FORK_REMOTE}."
else
  echo "Push skipped. Run with WOTCV_PUSH=1 to push automatically."
fi
