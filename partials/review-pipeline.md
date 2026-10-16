### Pin the change

Run the context command from the step above. It writes one directory with the diff, changed files, commits, the spec (PR description and linked issues), the repo's `AGENTS.md` and `REVIEW.md`, and the reviewer's axioms when present. It prints `context.json`. Every reviewer reads this directory, so they all see the same inputs.

Then start a ledger round:

```sh
node <skill>/scripts/agent-review.mjs ledger start --repo <owner/repo> --key <key> --base <mergeBase> --head <head> --lenses <comma-separated lenses>
```

Take `repo`, `key`, `mergeBase`, `head` and `lenses` from `context.json`. `REVIEW.md` rules override the general guidance below.

The ledger allows 3 rounds. After that, `start` refuses, because later rounds mostly find older problems instead of new ones. Stop and tell the user that this change has had 3 reviews, and suggest that the author step back and reconsider the approach. Start another round with `--past-cap` only when the user asks for one.

### Run the panel

Run one reviewer per lens in `context.json` (3 to 6), even for a small diff. A small diff only makes each reviewer quicker. Do not review it yourself instead of running the panel. Each reviewer starts with a fresh context, sees only the pinned directory and the repository, and does not see the other reviewers' findings. Get each reviewer's prompt from:

```sh
node <skill>/scripts/agent-review.mjs lens prompt <lens> --context <dir>
```

Spread the lenses across at least two model families:

- **Tau:** start the reviewers as parallel subagent tasks. Give about half of them a model from another provider (set `model` to `provider/model-id`).
- **Claude Code:** start the reviewers as parallel subagents. Run correctness and one other lens on a second family with `node <skill>/scripts/agent-review.mjs lens run <lens> --via codex --context <dir> --repo-dir <repo>`.
- **Codex:** start the reviewers as subagents. Run correctness and one other lens with `--via claude`.

Wait for every reviewer to return before the next step, and do the same for verifiers. Never end your turn while a subagent is still running: in a non-interactive session, ending the turn ends the review.

If no second family is available, say so in the report. Do not present a single-family review as cross-checked.

Each reviewer returns a JSON array of findings: `file`, `line`, `title`, `precondition`, `scenario`, `evidence`, `axiom` for taste findings, `class` (the kind of bug, in kebab-case), and `instances` (every other place with the same mistake). Record every reviewer that ran, including one that found nothing, and set `lens` and `model` on each finding. Then add all the findings to the ledger:

```sh
node <skill>/scripts/agent-review.mjs ledger ran --repo <repo> --key <key> --lens <lens> --model <provider/model> --findings <count>
node <skill>/scripts/agent-review.mjs ledger add --repo <repo> --key <key> --file findings.json
```

### Merge duplicates

Reviewers often find the same problem. Group findings that share a root cause: same file, nearby lines, and the same failing scenario. Keep the clearest one as the primary, and merge the rest into it:

```sh
node <skill>/scripts/agent-review.mjs ledger merge --repo <repo> --key <key> --into F1 --ids F4,F7
```

The duplicates stay in the ledger, and the report shows how many reviewers and model families found the problem. Merge only true duplicates. Two different bugs on the same line stay separate.

In a follow-up round, also merge a new finding into an earlier finding it repeats, from `ledger open` or the ledger file. That covers earlier findings that were closed, too: a finding the author called wrong or intended must not come back. `ledger report` refuses while a new finding sits in the same file as an earlier one, on nearby lines or with the same class. Merge it, or pass `--keep <id>` when it is a different bug.

### Verify every finding

A reviewer's finding is a claim, not a fact. For each primary finding, start a fresh verifier: a subagent that did not write the finding, on a different model from its author when possible. Give it the finding, the pinned directory, and the rubric from `node <skill>/scripts/agent-review.mjs rubric show finding-verification`. The verifier reads the code itself. It must show that the precondition can occur, and give the call path or a repro, before it answers `confirmed`. Record its answer:

```sh
node <skill>/scripts/agent-review.mjs ledger decide --repo <repo> --key <key> --id F1 --kind finding-verification --json '{"label":"confirmed","probability":0.85,"model":"<provider/model>","rationale":"..."}'
```

When two reviewers disagree about the same code, or a verifier is unsure (probability from 0.4 to 0.7), get one more opinion from a reviewer on a third model, or on the family that has not seen the finding yet. Show it the claim without its author or the earlier verdicts, and record that answer as the verification decision.

The verifier also checks each place in `instances`. Name any that do not hold in its rationale, and leave them out of the report.

For every confirmed finding, also record `finding-severity` (blocker, should-fix or nit), `finding-triage` (agent-fixable or needs-judgment) and `finding-origin` (introduced, missed or pre-existing), using each kind's rubric from `node <skill>/scripts/agent-review.mjs rubric show <kind>`. Only an introduced finding can be a blocker. The report moves a missed or pre-existing blocker to should-fix, and refuses a blocker with no origin.

### Select what to report

```sh
node <skill>/scripts/agent-review.mjs ledger report --repo <repo> --key <key>
```

This keeps confirmed findings at or above the verification threshold (0.7). It gives each one a `section` (blockers, should-fix, pre-existing, smaller) and a number `n` in report order. Each finding's `instances` include the places its duplicates found. The output also gives `counts` per section, `earlierOpen` (earlier findings still open, per section) and a `verdict` (`ready` or `needs-changes`). It lists the IDs it dropped and the model families that took part. It refuses to run while a chosen lens has no recorded run or a finding has no verification. Fix the gap; do not work around it. Use `--allow-missing` only when a lens truly could not run, and name the skipped lenses under **Not checked**. Report only what it returns.
