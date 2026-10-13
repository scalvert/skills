---
name: review-my-changes
description: Review your own branch before you open or merge a pull request. Runs independent reviewers on at least two model families, verifies every finding, applies the fixes that have one clear answer in a separate commit, and lists the findings that need your judgment. Use when asked to self-review, check my changes, review before I open a PR, or get a branch ready to merge.
---

# Review my changes

Input: the current branch in a worktree. Output: a report, one commit with the agent-fixable fixes, a list of findings that need judgment, and a ledger entry. It merges only when the repo's rules allow it.

For someone else's PR, use `review-pull-request`.

## Steps

Pin the branch against its base (the default is `origin/HEAD`):

```sh
git fetch -q origin
node scripts/review-context.mjs [--base origin/main]
```

The key is the branch name. Commit or stash your own work first. The review covers committed changes only.

{{> review-pipeline}}

### Apply the agent-fixable findings

For each reported finding that triage marked `agent-fixable`:

1. Make the smallest change that fixes it. Do not refactor nearby code.
2. Add or update a test when the finding is about behavior.
3. Run the repo's checks from `AGENTS.md` (build, tests, lint).

Put all of these fixes in one commit, separate from the work it reviews, titled `fix: address self-review findings`. List the finding IDs in the body. If the checks fail and the fix is not clear, revert that fix and move the finding to the needs-judgment list.

Then record each fixed finding:

```sh
node scripts/review-ledger.mjs dispose --repo <repo> --key <key> --id F3 --as fixed
```

{{> review-report}}

Add a **Needs your judgment** section after **Smaller items**. For each needs-judgment finding, give the choice to make and the option you recommend, with one line on why.

{{> no-external-writes}}

### Merging

Merge only when all of these hold:

- `node scripts/permissions.mjs check -- gh pr merge <number>` returns `allow`, or the user approves the merge in this conversation;
- no blockers remain;
- the needs-judgment list is empty, or the user has answered every item.

Otherwise stop after the report and say what is left.

## Done when

- The fix commit exists (or the report says no finding was agent-fixable).
- The needs-judgment list matches the ledger.
- Nothing merged without an `allow` rule or the user's approval.
