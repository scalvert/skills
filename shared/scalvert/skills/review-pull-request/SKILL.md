---
name: review-pull-request
description: Review a GitHub pull request with independent reviewers on at least two model families, verify every finding against the code, and return a verdict with numbered blockers and draft line comments. Never posts anything. Use when asked to review a PR, look over a pull request, or check someone else's changes before they merge.
---

# Review a pull request

Input: a PR number or URL, in the repository's checkout. Output: a report in this conversation, draft line comments, and a ledger entry. Nothing is posted to GitHub.

For your own unpushed or unmerged branch, use `review-my-changes`. For a PR you already reviewed, use `re-review-pull-request`.

## Steps

In the commands below, `<skill>` is the folder that holds this SKILL.md. Run every command from the repository root, not from the skill folder.

Pin the PR from the repository root:

```sh
node <skill>/scripts/review-context.mjs --pr <number>
```

The key is the PR number. Read the code at the PR head, for example in a read-only worktree: `git worktree add .worktrees/review-<number> <head>`. Remove it when you finish.

{{> review-pipeline}}

{{> review-report}}

### Draft line comments

After the report, give one draft comment per reported finding, in this form:

```text
path/file.ts:42
<The problem in one sentence.> <The scenario.> <A suggested fix, if one is clear.>
```

Write them the way a colleague would: direct, specific, no "consider maybe". Start each with the finding ID from the report.

{{> no-external-writes}}

If the user asks you to post the comments, post them as one pending review, so they can read it before it goes out. Check `gh api` writes with the command above first.

## Done when

- The report and draft comments are in the conversation.
- The ledger has this round, every finding, a verification decision for each, and severity and triage for each confirmed finding.
- Nothing was posted unless the user approved that exact action.
