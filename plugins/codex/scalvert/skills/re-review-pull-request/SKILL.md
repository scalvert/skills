---
name: re-review-pull-request
description: Review a pull request again after the author pushed changes. Reviews only the commits since the last review, keeps the original finding IDs, checks whether each earlier finding was fixed, and adds a new blocker only for a problem the new commits introduced. Use when asked to re-review, take another look, or check whether review feedback was addressed.
---

# Re-review a pull request

Input: a PR you reviewed before with `review-pull-request`. Output: a report that answers each earlier finding by its ID, plus any new findings from the new commits. Nothing is posted.

## Steps

In the commands below, `<skill>` is the folder that holds this SKILL.md. Run every command from the repository root, not from the skill folder.

Find the commit you last reviewed:

```sh
node <skill>/scripts/review-ledger.mjs last-head --repo <owner/repo> --key <number>
```

If it prints nothing, there is no earlier review. Use `review-pull-request` instead.

Pin only the new commits:

```sh
node <skill>/scripts/review-context.mjs --pr <number> --since <last head>
```

If the author force-pushed, the last head is no longer an ancestor of the PR head and `--since` fails. In that case, pin the full PR without `--since`, and say in the report that history was rewritten.

### Check the earlier findings

List every finding that is still open: reported in any earlier round and not yet closed.

```sh
node <skill>/scripts/review-ledger.mjs open --repo <owner/repo> --key <number>
```

For each one, check the new code and decide:

- **Fixed:** the scenario no longer happens. Record `dispose --as fixed`.
- **Not fixed:** the scenario still happens. Keep its ID.
- **Answered:** the author replied with a reason, and the reason holds. Record `dispose --as wont-fix --note "<reason>"`. When the reason does not hold, keep the finding open and say why.

Do not relabel. F2 stays F2 in every round.

### Review the new commits

### Pin the change

Run the context command from the step above. It writes one directory with the diff, changed files, commits, the spec (PR description and linked issues), the repo's `AGENTS.md` and `REVIEW.md`, and the reviewer's axioms when present. It prints `context.json`. Every reviewer reads this directory, so they all see the same inputs.

Then start a ledger round:

```sh
node <skill>/scripts/review-ledger.mjs start --repo <owner/repo> --key <key> --base <mergeBase> --head <head> --lenses <comma-separated lenses>
```

Take `repo`, `key`, `mergeBase`, `head` and `lenses` from `context.json`. `REVIEW.md` rules override the general guidance below.

### Run the panel

Run one reviewer per lens in `context.json` (3 to 6), even for a small diff. A small diff only makes each reviewer quicker. Do not review it yourself instead of running the panel. Each reviewer starts with a fresh context, sees only the pinned directory and the repository, and does not see the other reviewers' findings. Get each reviewer's prompt from:

```sh
node <skill>/scripts/run-lens.mjs --print-prompt --lens <lens> --context <dir>
```

Spread the lenses across at least two model families:

- **Tau:** start the reviewers as parallel subagent tasks. Give about half of them a model from another provider (set `model` to `provider/model-id`).
- **Claude Code:** start the reviewers as parallel subagents. Run correctness and one other lens on a second family with `node <skill>/scripts/run-lens.mjs --via codex --lens <lens> --context <dir> --repo-dir <repo>`.
- **Codex:** start the reviewers as subagents. Run correctness and one other lens with `--via claude`.

Wait for every reviewer to return before the next step, and do the same for verifiers. Never end your turn while a subagent is still running: in a non-interactive session, ending the turn ends the review.

If no second family is available, say so in the report. Do not present a single-family review as cross-checked.

Each reviewer returns a JSON array of findings: `file`, `line`, `title`, `precondition`, `scenario`, `evidence`, and `axiom` for taste findings. Record every reviewer that ran, including one that found nothing, and set `lens` and `model` on each finding. Then add all the findings to the ledger:

```sh
node <skill>/scripts/review-ledger.mjs ran --repo <repo> --key <key> --lens <lens> --model <provider/model> --findings <count>
node <skill>/scripts/review-ledger.mjs add --repo <repo> --key <key> --file findings.json
```

### Merge duplicates

Reviewers often find the same problem. Group findings that share a root cause: same file, nearby lines, and the same failing scenario. Keep the clearest one as the primary, and merge the rest into it:

```sh
node <skill>/scripts/review-ledger.mjs merge --repo <repo> --key <key> --into F1 --ids F4,F7
```

The duplicates stay in the ledger, and the report shows how many reviewers and model families found the problem. Merge only true duplicates. Two different bugs on the same line stay separate.

### Verify every finding

A reviewer's finding is a claim, not a fact. For each primary finding, start a fresh verifier: a subagent that did not write the finding, on a different model from its author when possible. Give it the finding, the pinned directory, and the rubric from `node <skill>/scripts/classify.mjs rubric finding-verification`. The verifier reads the code itself. It must show that the precondition can occur, and give the call path or a repro, before it answers `confirmed`. Record its answer:

```sh
node <skill>/scripts/review-ledger.mjs decide --repo <repo> --key <key> --id F1 --kind finding-verification --json '{"label":"confirmed","probability":0.85,"model":"<provider/model>","rationale":"..."}'
```

When two reviewers disagree about the same code, or a verifier is unsure (probability from 0.4 to 0.7), get one more opinion from a reviewer on a third model, or on the family that has not seen the finding yet. Show it the claim without its author or the earlier verdicts, and record that answer as the verification decision.

For every confirmed finding, also record `finding-severity` (blocker, should-fix or nit) and `finding-triage` (agent-fixable or needs-judgment), using each kind's rubric from `<skill>/scripts/classify.mjs rubric`.

### Select what to report

```sh
node <skill>/scripts/review-ledger.mjs report --repo <repo> --key <key>
```

This keeps confirmed findings at or above the verification threshold (0.7), sorted by severity. It lists the IDs it dropped and the model families that took part. It refuses to run while a chosen lens has no recorded run or a finding has no verification. Fix the gap; do not work around it. Use `--allow-missing` only when a lens truly could not run, and name the skipped lenses under **Not checked**. Report only what it returns.

In this round, a new **blocker** must come from a problem the new commits introduce. A problem that was already present in round one, and that you missed then, goes under **Should fix** with the note "missed in round 1". Raising new blockers late, for old code, keeps a PR from converging.

### Write the report

Use this shape, and nothing longer than the content needs:

```markdown
**Verdict:** <Ready to merge | Needs changes | Blocked>, in one sentence that says why.

**Blockers**
- **F1** `path/file.ts:42` <title>. <scenario in one or two sentences>. <evidence: the call path or repro>. (Found by 3 reviewers on 2 model families.)

**Should fix**
- **F4** ...

**Smaller items** (at most 5; drop the rest)
- ...

**Checked:** <lenses run>, on <model families>, at <short head SHA>. <What you ran, such as tests or a repro, or "Read only.">
**Not checked:** <anything a reader might assume you covered but you did not>.
```

Rules for the prose:

- Lead with the verdict. Label each finding with its ledger ID (F1, F2, ...), so the author can answer "F1 is fixed" and later rounds keep the same labels.
- One finding per item. Give file and line, the scenario, and the evidence. Leave out praise and summaries of the diff.
- Plain words, short sentences, active voice. No em dashes, no emoji, no "it's worth noting".
- Cite the `REVIEW.md` rule or axiom ID when a finding rests on one.
- Leave out the dropped findings. They stay in the ledger.

Save the report and draft comments to a file and run `node <skill>/scripts/check-prose.mjs <file>`. Fix each flag, or keep it on purpose (for example, a quoted error message), before you show the report.

Start the report with an **Earlier findings** list, one line per ID: `F1 fixed in <sha>.`, `F2 not fixed: <why>.`, or `F3 answered: <reason accepted>.` Then give the verdict and the new findings, which the ledger gives new IDs.

### Before anything leaves this machine

This skill never posts, comments, approves, merges, pushes to the default branch, or publishes on its own. Before any command or tool call that does one of those things, check the repo's rules:

```sh
node <skill>/scripts/permissions.mjs check -- <the exact command>
```

- `allow`: the repo's rules permit it. Go ahead.
- `ask`: ask the user in this conversation, naming the exact action. Go ahead only after they say yes to that action.
- `deny`: do not do it. Tell the user which rule denies it.

A request earlier in the conversation to "review" something is not approval to post the review.

## Done when

- Every earlier reported finding has a status in the report and a disposition in the ledger when it is closed.
- New findings carry new IDs, and the original IDs did not change.
