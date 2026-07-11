#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/lib/wotcv-common.sh"
TARGET_BRANCH="${WOTCV_TARGET_BRANCH:-master}"
FEATURE_BRANCH="${WOTCV_FEATURE_BRANCH:-feat/wotcv}"
FORK_REMOTE="${WOTCV_FORK_REMOTE:-origin}"
UPSTREAM_REMOTE="${WOTCV_UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${WOTCV_UPSTREAM_URL:-https://github.com/rybbit-io/rybbit.git}"
UPSTREAM_BRANCH="${WOTCV_UPSTREAM_BRANCH:-master}"
PUSH_CHANGES="${WOTCV_PUSH:-0}"
MERGE_FEATURE="${WOTCV_MERGE_FEATURE:-0}"

cd "${ROOT_DIR}"

wotcv_require_commands git
wotcv_require_clean_worktree

if ! git remote get-url "${UPSTREAM_REMOTE}" >/dev/null 2>&1; then
  git remote add "${UPSTREAM_REMOTE}" "${UPSTREAM_URL}"
fi

git fetch "${FORK_REMOTE}" --prune
git fetch "${UPSTREAM_REMOTE}" --prune

read -r fork_only upstream_only <<<"$(git rev-list --left-right --count "${FORK_REMOTE}/${TARGET_BRANCH}...${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}")"
echo "Before merge: fork-only=${fork_only}, upstream-only=${upstream_only}"

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

if [[ "${MERGE_FEATURE}" == "1" ]]; then
  wotcv_require_clean_worktree

  if git show-ref --verify --quiet "refs/heads/${FEATURE_BRANCH}"; then
    git switch "${FEATURE_BRANCH}"
  else
    git switch --track -c "${FEATURE_BRANCH}" "${FORK_REMOTE}/${FEATURE_BRANCH}"
  fi

  git merge --ff-only "${FORK_REMOTE}/${FEATURE_BRANCH}"
  FEATURE_BACKUP_BRANCH="backup/${FEATURE_BRANCH//\//-}-before-${TARGET_BRANCH}-$(date -u +%Y%m%dT%H%M%SZ)"
  git branch "${FEATURE_BACKUP_BRANCH}"

  echo "Merging ${TARGET_BRANCH} into ${FEATURE_BRANCH}..."
  if ! git merge --no-ff "${TARGET_BRANCH}" -m "chore: merge ${TARGET_BRANCH} into ${FEATURE_BRANCH}"; then
    echo "Feature branch merge has conflicts." >&2
    echo "Resolve conflicts, validate the fork, then commit the merge." >&2
    echo "Backup branch: ${FEATURE_BACKUP_BRANCH}" >&2
    exit 1
  fi

  echo "Feature branch updated: ${FEATURE_BRANCH} at $(git rev-parse HEAD)"
  echo "Feature backup branch: ${FEATURE_BACKUP_BRANCH}"
fi

if [[ "${PUSH_CHANGES}" == "1" ]]; then
  git push "${FORK_REMOTE}" "${TARGET_BRANCH}"
  echo "Pushed ${TARGET_BRANCH} to ${FORK_REMOTE}."
  if [[ "${MERGE_FEATURE}" == "1" ]]; then
    git push "${FORK_REMOTE}" "${FEATURE_BRANCH}"
    echo "Pushed ${FEATURE_BRANCH} to ${FORK_REMOTE}."
  fi
else
  echo "Push skipped. Run with WOTCV_PUSH=1 after validation to push automatically."
fi
