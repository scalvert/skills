---
name: code-review
description: Review a GitHub pull request with independent reviewers on at least two model families, verify every finding against the code, and return a verdict with numbered blockers and draft line comments. On a pull request it reviewed before, it reviews only the new commits, keeps the earlier finding IDs, and says whether each one was fixed. Never posts anything. Use when asked to review a PR, do a code review, re-review, take another look, or check whether review feedback was addressed.
---

# Code review

Input: a PR number or URL, in the repository's checkout. Output: a report in this conversation, draft line comments, and a ledger entry. Nothing is posted to GitHub.

For your own branch before anyone else reviews it, use `self-review`. To work through comments on your own PR, use `address-review-comments`.

## Steps

In the commands below, `<skill>` is the folder that holds this SKILL.md. Run every command from the repository root, not from the skill folder.

### Find the round

Check whether this PR was reviewed before:

```sh
node <skill>/scripts/agent-review.mjs ledger last-head --repo <owner/repo> --key <number>
```

- **It prints nothing:** this is a first review. Pin the whole PR:

  ```sh
  node <skill>/scripts/agent-review.mjs pin --pr <number>
  ```

- **It prints a commit:** this is a follow-up review. Pin only the commits since that one:

  ```sh
  node <skill>/scripts/agent-review.mjs pin --pr <number> --since <last head>
  ```

  If the author force-pushed, the last head is no longer an ancestor of the PR head and `--since` fails. Pin the whole PR instead, and say in the report that history was rewritten. When the user asks for a full review, also pin the whole PR. In both cases, still check the earlier findings below.

The key is the PR number. Read the code at the PR head, for example in a read-only worktree: `git worktree add .worktrees/review-<number> <head>`. Remove it when you finish.

### Check the earlier findings (follow-up only)

List every finding that is still open: reported in an earlier round and not yet closed.

```sh
node <skill>/scripts/agent-review.mjs ledger open --repo <owner/repo> --key <number>
```

For each one, check the new code and decide:

- **Fixed:** the scenario no longer happens. Record `dispose --as fixed`.
- **Not fixed:** the scenario still happens. Keep its ID.
- **Answered:** the author replied with a reason, and the reason holds. Record `dispose --as wont-fix --note "<reason>"`. When the reason does not hold, keep the finding open and say why.

Do not relabel. F2 stays F2 in every round.

{{> review-pipeline}}

In a follow-up review, a new **blocker** must come from a problem the new commits introduce. A problem that was already present in an earlier round, and that you missed then, goes under **Should fix** with the note "missed in round 1". Raising new blockers late, for old code, keeps a PR from converging.

{{> review-report}}

Start every report with the round: `First review at <short head SHA>.` or `Follow-up review since <short last head>.` In a follow-up, add an **Earlier findings** list next, one line per ID: `F1 fixed in <sha>.`, `F2 not fixed: <why>.`, or `F3 answered: <reason accepted>.` Then give the verdict and the new findings, which the ledger gives new IDs.

### Draft line comments

After the report, give one draft comment per new reported finding, in this form:

```text
path/file.ts:42
<The problem in one sentence.> <The scenario.> <A suggested fix, if one is clear.>
```

Write them the way a colleague would: direct, specific, no "consider maybe". Start each with the finding ID from the report.

{{> no-external-writes}}

If the user asks you to post the comments, post them as one pending review, so they can read it before it goes out. Check `gh api` writes with the command above first.

## Done when

- The report starts with the round, and the draft comments are in the conversation.
- The ledger has this round, every finding, a verification decision for each, and severity and triage for each confirmed finding.
- In a follow-up, every earlier reported finding has a status in the report and a disposition in the ledger when it is closed, and the original IDs did not change.
- Nothing was posted unless the user approved that exact action.
