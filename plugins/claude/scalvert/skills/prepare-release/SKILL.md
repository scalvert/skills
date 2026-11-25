---
name: prepare-release
description: Get a package ready for you to release, without releasing it. Checks that every merged pull request has a changelog label and a title that reads well, lists the open pull requests that should go in first, proposes the version and pre-release stage, runs the checks and a dry run, and gives you the exact command to run. Use when asked to prepare a release, do a release review, check release readiness, cut a release candidate or beta, or make sure the PRs are labelled before a release.
---

# Prepare a release

Input: a repo with release tooling. Output: a verdict (ready or not ready), the blockers, and the command the user runs.

This skill never releases, publishes, tags or pushes a version. The user cuts the release. For a wider review of whether the code itself is ready, use `assess-release-readiness`.

## Steps

### 1. Read how this repo releases

Read `RELEASE.md`, the release configuration and the release workflow. Note the tool, the changelog source, the labels it reads and how a release starts (a command or a workflow). Follow what the repo does. Do not add a second release path.

### 2. List what the release contains

```sh
git fetch -q origin --tags
last=$(git describe --tags --abbrev=0 origin/HEAD)
git log --oneline "$last"..origin/HEAD
gh pr list --state merged --base <default branch> --search "merged:>=<date of $last>" --limit 200 --json number,title,labels,author
```

### 3. Check labels and titles

When the changelog is built from labels, a pull request with no label is left out of it.

- Every merged pull request has exactly one changelog label. Common sets are `breaking`, `enhancement`, `bug`, `documentation` and `internal`. Use the set the repo defines.
- Every title makes sense to a person who uses the package.

List the pull requests to fix, with the label or title you propose. Changing a label or a title is an edit on GitHub, so ask before you apply the list. When labels are missed often, propose a CI check that fails a pull request with no label.

### 4. List what should go in first

List the open pull requests that are ready or close, and recommend which to land before the release. Use `clear-pr-queue` when the user wants them landed.

### 5. Propose the version

- Derive the increment from the labels: a `breaking` label means a major version, or a minor version below 1.0.
- Keep the pre-release stage the repo is on. A package on `rc` stays on `rc`, and a package on `beta` stays on `beta`, until the user says to move.
- State the exact version you expect, such as `2.0.0-rc.2`. A release tool can jump to a final major version when no pre-release flag is passed. Say which flag prevents that.

Confirm the version with the user.

### 6. Run the checks

On an up-to-date default branch, in a clean worktree:

- Install, build, test and lint with the repo's own commands.
- Audit the production dependencies, such as `npm audit --omit=dev`.
- Look at what ships: `npm pack --dry-run`.
- Install the packed tarball in an empty folder and run it. See `verify-end-to-end`.
- Check that the README and the docs match the behavior that changed.

### 7. Dry run

Run the release tool's dry run, or the workflow's dry-run input. Read the changelog it would write. Check that the version, the tag and the entries are what step 5 expects.

### 8. Report

1. **Ready** or **not ready**, in one line.
2. Blockers, each with what clears it.
3. The version, and the changelog as the dry run printed it.
4. The exact command or workflow run that releases it.

### After the user releases

When the user says the release is out, check it: the registry shows the new version, the tag and the release exist, and a fresh install runs. Draft an announcement only when asked, with `draft-reply`.

## Done when

- Every merged pull request since the last release has a label and a clear title, or is on the list to fix.
- The dry run shows the expected version and changelog.
- The report gives the exact release command.
- Nothing was released, published, tagged or pushed.
