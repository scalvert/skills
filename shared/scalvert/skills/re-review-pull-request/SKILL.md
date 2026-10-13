---
name: re-review-pull-request
description: Review a pull request again after the author pushed changes. Reviews only the commits since the last review, keeps the original finding IDs, checks whether each earlier finding was fixed, and adds a new blocker only for a problem the new commits introduced. Use when asked to re-review, take another look, or check whether review feedback was addressed.
---

# Re-review a pull request

Input: a PR you reviewed before with `review-pull-request`. Output: a report that answers each earlier finding by its ID, plus any new findings from the new commits. Nothing is posted.

## Steps

Find the commit you last reviewed:

```sh
node scripts/review-ledger.mjs last-head --repo <owner/repo> --key <number>
```

If it prints nothing, there is no earlier review. Use `review-pull-request` instead.

Pin only the new commits:

```sh
node scripts/review-context.mjs --pr <number> --since <last head>
```

If the author force-pushed and the last head is no longer in the branch history, `--since` fails. In that case, pin the full PR and say in the report that history was rewritten.

### Check the earlier findings

Read the earlier round's reported findings from the ledger file (`review-ledger.mjs path` prints it). For each one, check the new code and decide:

- **Fixed:** the scenario no longer happens. Record `dispose --as fixed`.
- **Not fixed:** the scenario still happens. Keep its ID.
- **Answered:** the author replied with a reason, and the reason holds. Record `dispose --as wont-fix --note "<reason>"`. When the reason does not hold, keep the finding open and say why.

Do not relabel. F2 stays F2 in every round.

### Review the new commits

{{> review-pipeline}}

In this round, a new **blocker** must come from a problem the new commits introduce. A problem that was already present in round one, and that you missed then, goes under **Should fix** with the note "missed in round 1". Raising new blockers late, for old code, keeps a PR from converging.

{{> review-report}}

Start the report with an **Earlier findings** list, one line per ID: `F1 fixed in <sha>.`, `F2 not fixed: <why>.`, or `F3 answered: <reason accepted>.` Then give the verdict and the new findings, which the ledger gives new IDs.

{{> no-external-writes}}

## Done when

- Every earlier reported finding has a status in the report and a disposition in the ledger when it is closed.
- New findings carry new IDs, and the original IDs did not change.
