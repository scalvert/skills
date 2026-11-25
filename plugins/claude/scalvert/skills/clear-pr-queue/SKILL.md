---
name: clear-pr-queue
description: Work through every open pull request in a repo and leave none sitting. Sorts them into yours, dependency updates and other people's, lands the ones that are ready, repairs or closes the ones that are stale, and reviews the rest with specific comments. Use when asked to review all open PRs, clean up the PRs, merge what is ready, merge the Dependabot PRs, or clear the queue before a release.
---

# Clear the pull request queue

Input: a repo. Output: a table with one row per open pull request and what happened to it.

In the commands below, `<skill>` is the folder that holds this SKILL.md. Run every command from the repository root.

## Steps

### 1. List the queue

```sh
gh pr list --state open --limit 100 --json number,title,author,isDraft,labels,updatedAt,headRefName,baseRefName,reviewDecision,statusCheckRollup,mergeable
```

Read the repo's rules in `AGENTS.md` first. They decide what you may merge, approve or comment on.

### 2. Sort each pull request

| Kind | How to tell | What to do |
|---|---|---|
| Yours | The author is the user, or an agent working for the user | Step 4 |
| Dependency update | The author is a dependency bot | Step 3 |
| Someone else's | Any other author | Step 5 |

Then mark the ones that should not merge at all: a pull request that a later one replaced, one whose change already reached the base branch another way, and a draft the author is still working on. Propose closing the first two, with the pull request or commit that replaced each one. Leave drafts alone.

### 3. Dependency updates

- Green patch and minor updates: merge.
- Major updates: read the changelog for breaking changes first. Merge when nothing the repo uses has changed. Otherwise repair it on a branch, or say what the upgrade needs.
- Red updates: read the failure. Fix the cause on the bot's branch or on a new branch that replaces it. Do not close a failing update only because it fails.
- After each merge, the next update often conflicts in the lockfile. Ask the bot to rebase it, then wait for CI.

Merge these before a major version bump or a release, so the dependency changes do not ride along with it.

### 4. Yours

Use `land-pull-request` for each one. When two of them touch the same files, land the older one first.

### 5. Someone else's

Run `code-review`. Then:

- No blocking findings: approve, when the repo's rules let you.
- Blocking findings: draft line comments that name the exact change to make.

Never merge another person's pull request unless the user says to merge that one.

### 6. Keep the order

Every merge moves the base branch. After each one, update the next pull request and wait for its CI before you merge it. Use a subagent per pull request only when the pull requests do not touch the same files.

### Before anything leaves this machine

This skill never posts, comments, approves, merges, pushes to the default branch, or publishes on its own. Before any command or tool call that does one of those things, check the repo's rules:

```sh
node <skill>/scripts/agent-review.mjs policy check -- <the exact command>
```

- `allow`: the repo's rules permit it. Go ahead.
- `ask`: ask the user in this conversation, naming the exact action. Go ahead only after they say yes to that action.
- `deny`: do not do it. Tell the user which rule denies it.

A request earlier in the conversation to "review" something is not approval to post the review.

Ask once for the whole batch. Show the table from step 7 with the action you plan for each pull request, and get approval before you merge, approve, comment or close.

### 7. Report

| Pull request | Kind | Action | Result or what blocks it |
|---|---|---|---|

Name each pull request by its number and title. End with the count that is still open, and why each one is.

## Done when

- Every open pull request has a row.
- Each one is merged, closed, approved, commented on or waiting on a named person.
- Nothing was merged, approved, commented on or closed without an `allow` rule or the user's approval.
