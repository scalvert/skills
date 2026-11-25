---
name: land-pull-request
description: Take your own pull request, or a stack of them, from open to merged. Brings it up to date, reviews it, resolves every review thread including bot comments, gets CI green, fixes the title, labels and description, merges the way the repo requires, then restacks what sits above it. Use when asked to land this, get this merged, review and merge if ready, merge once green, clean up this PR, resolve the comments and merge, or keep the stack healthy.
---

# Land a pull request

Input: a pull request you wrote, or a stack of them. Output: the pull request merged, or the list of what still blocks it. For someone else's pull request, use `code-review`. For every open pull request in a repo, use `clear-pr-queue`.

In the commands below, `<skill>` is the folder that holds this SKILL.md. Run every command from the repository root.

## Steps

### 1. Read the repo's rules

Read `AGENTS.md`, `CONTRIBUTING.md` and the branch protection before anything else:

```sh
gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge
gh pr view <number> --json title,labels,isDraft,baseRefName,mergeable,reviewDecision,statusCheckRollup
```

Note the merge method, the title convention, the labels a release needs and who must approve. Use the repo's own commit and pull request tools when it has them. When the repo allows more than one merge method and states no preference, squash.

### 2. Bring it up to date

Fetch, then rebase the branch on its base. Resolve conflicts by reading both sides. Never take one side wholesale to make the conflict go away. Run the repo's checks again after the rebase.

In a stack, start at the bottom. Use the stack tool the repo already uses to restack. Never land a pull request whose parent is still open.

### 3. Review it

Run `self-review` when the branch has changed since its last review. Fix the findings before you go on.

### 4. Resolve every thread

```sh
node <skill>/scripts/agent-review.mjs threads list --pr <number>
```

Work through them with `address-review-comments`. A bot's comment is a claim like any other: verify it, then fix it or reply with the evidence. A thread left open, even a wrong one, makes it impossible to see what is still outstanding.

### 5. Get CI green

```sh
gh pr checks <number> --watch
```

On a failure, read the log and fix the cause. Rerun a job once only when the log shows a failure that is not from the change, and say that you did. Never skip, disable or loosen a test to get a green run.

### 6. Fix the title, labels and description

- The title follows the repo's convention and makes sense to a user who reads it in a changelog.
- The pull request has the changelog label the release tooling needs.
- The description says what changed, why, and how it was tested.
- In a public repo, the title, description, commits and comments carry no internal ticket keys, internal links or private names.

### 7. Merge

### Before anything leaves this machine

This skill never posts, comments, approves, merges, pushes to the default branch, or publishes on its own. Before any command or tool call that does one of those things, check the repo's rules:

```sh
node <skill>/scripts/agent-review.mjs policy check -- <the exact command>
```

- `allow`: the repo's rules permit it. Go ahead.
- `ask`: ask the user in this conversation, naming the exact action. Go ahead only after they say yes to that action.
- `deny`: do not do it. Tell the user which rule denies it.

A request earlier in the conversation to "review" something is not approval to post the review.

Everything that leaves this machine (commit messages, PR titles and descriptions, comments and replies) is about the change: what it does, why, and how it was tested. Leave out how it was reviewed. No review rounds, reviewer or verifier counts, lenses, models or model families, ledger IDs, or "self-review". That stays in this conversation. The check below catches the common phrasings, not every one, so read each text yourself too. Check each of those texts before it goes out:

```sh
node <skill>/scripts/agent-review.mjs prose --github <file>
```

Merge only when every thread is resolved, CI is green and the required approvals are in. Then:

```sh
gh pr merge <number> --squash --delete-branch
```

Replace `--squash` when the repo requires another method.

### 8. After the merge

- Confirm the commit is on the base branch.
- Restack the pull requests above it, and check that each one is still green.
- Remove the worktree: `git worktree remove <path>`.
- Update the ticket, when there is one.

## Done when

- The pull request is merged with the repo's merge method, or the report lists each blocker and who can clear it.
- No review thread is open.
- The pull requests above it in the stack are restacked and green.
- Nothing merged without an `allow` rule or the user's approval.
