---
name: self-review
description: Review your own branch before you open or merge a pull request. Runs independent reviewers on at least two model families, verifies every finding, applies the fixes that have one clear answer in a separate commit, and lists the findings that need your judgment. Use when asked to self-review, check my changes, review my branch, review before I open a PR, or get a branch ready to merge.
---

# Self-review

Input: the current branch in a worktree. Output: a report, one commit with the agent-fixable fixes, a list of findings that need judgment, and the review's history in the review harness. It merges only when the repo's rules allow it.

For someone else's PR, use `code-review`.

## Steps

In the commands below, `<skill>` is the folder that holds this SKILL.md. Run every command from the repository root, not from the skill folder.

Pin the branch against its base (the default is `origin/HEAD`):

```sh
git fetch -q origin
node <skill>/scripts/agent-review.mjs pin [--base origin/main]
```

The key is the branch name. Commit or stash your own work first. The review covers committed changes only. When the branch has an open PR, `pin` uses its description as the spec.

{{> review-pipeline}}

### Apply the agent-fixable findings

For each reported finding that triage marked `agent-fixable`:

1. Make the smallest change that fixes it. Do not refactor nearby code.
2. Add or update a test when the finding is about behavior.
3. Run the repo's checks from `AGENTS.md` (build, tests, lint).

Put all of these fixes in one commit, separate from the work it reviews, titled `fix: address self-review findings`. List the findings by title in the body, not by number. If the checks fail and the fix is not clear, revert that fix and move the finding to the needs-judgment list.

Then record each fixed finding:

```sh
node <skill>/scripts/agent-review.mjs review dispose --repo <repo> --key <key> --finding <n> --as fixed --actor <actor>
```

{{> review-report}}

Add a **Needs your judgment** section after **Smaller items**. For each needs-judgment finding, give the choice to make and the option you recommend, with one line on why.

{{> suggest-rules}}

### Draft the PR description

When the branch has no PR yet, draft three sections for its description, from what you ran:

- **Testing:** the commands you ran and what they returned.
- **Risk:** what could break, and how someone would notice.
- **How to revert:** the one step that undoes the change, such as a revert, a flag, or a config value.

Draft only. Opening the PR follows the repo's rules below.

{{> no-external-writes}}

### Merging

Merge only when all of these hold:

- `node <skill>/scripts/agent-review.mjs policy check -- gh pr merge <number>` returns `allow`, or it returns `ask` and the user approves the merge in this conversation. A `deny` is final: no approval overrides it;
- no blockers remain;
- the needs-judgment list is empty, or the user has answered every item.

Otherwise stop after the report and say what is left.

## Done when

- The fix commit exists (or the report says no finding was agent-fixable).
- The needs-judgment list matches the findings triaged `needs-judgment` in `findings report`.
- Nothing merged without an `allow` rule or the user's approval.
