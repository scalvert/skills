---
name: review-my-changes
description: Review your own branch before you open or merge a pull request. Runs independent reviewers on at least two model families, verifies every finding, applies the fixes that have one clear answer in a separate commit, and lists the findings that need your judgment. Use when asked to self-review, check my changes, review before I open a PR, or get a branch ready to merge.
---

# Review my changes

Input: the current branch in a worktree. Output: a report, one commit with the agent-fixable fixes, a list of findings that need judgment, and a ledger entry. It merges only when the repo's rules allow it.

For someone else's PR, use `review-pull-request`.

## Steps

In the commands below, `<skill>` is the folder that holds this SKILL.md. Run every command from the repository root, not from the skill folder.

Pin the branch against its base (the default is `origin/HEAD`):

```sh
git fetch -q origin
node <skill>/scripts/review-context.mjs [--base origin/main]
```

The key is the branch name. Commit or stash your own work first. The review covers committed changes only.

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

### Apply the agent-fixable findings

For each reported finding that triage marked `agent-fixable`:

1. Make the smallest change that fixes it. Do not refactor nearby code.
2. Add or update a test when the finding is about behavior.
3. Run the repo's checks from `AGENTS.md` (build, tests, lint).

Put all of these fixes in one commit, separate from the work it reviews, titled `fix: address self-review findings`. List the finding IDs in the body. If the checks fail and the fix is not clear, revert that fix and move the finding to the needs-judgment list.

Then record each fixed finding:

```sh
node <skill>/scripts/review-ledger.mjs dispose --repo <repo> --key <key> --id F3 --as fixed
```

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

Add a **Needs your judgment** section after **Smaller items**. For each needs-judgment finding, give the choice to make and the option you recommend, with one line on why.

### Before anything leaves this machine

This skill never posts, comments, approves, merges, pushes to the default branch, or publishes on its own. Before any command or tool call that does one of those things, check the repo's rules:

```sh
node <skill>/scripts/permissions.mjs check -- <the exact command>
```

- `allow`: the repo's rules permit it. Go ahead.
- `ask`: ask the user in this conversation, naming the exact action. Go ahead only after they say yes to that action.
- `deny`: do not do it. Tell the user which rule denies it.

A request earlier in the conversation to "review" something is not approval to post the review.

### Merging

Merge only when all of these hold:

- `node <skill>/scripts/permissions.mjs check -- gh pr merge <number>` returns `allow`, or it returns `ask` and the user approves the merge in this conversation. A `deny` is final: no approval overrides it;
- no blockers remain;
- the needs-judgment list is empty, or the user has answered every item.

Otherwise stop after the report and say what is left.

## Done when

- The fix commit exists (or the report says no finding was agent-fixable).
- The needs-judgment list matches the ledger.
- Nothing merged without an `allow` rule or the user's approval.
