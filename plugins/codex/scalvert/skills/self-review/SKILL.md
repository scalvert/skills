---
name: self-review
description: Review your own branch before you open or merge a pull request. Runs independent reviewers on at least two model families, verifies every finding, applies the fixes that have one clear answer in a separate commit, and lists the findings that need your judgment. Use when asked to self-review, check my changes, review my branch, review before I open a PR, or get a branch ready to merge.
---

# Self-review

Input: the current branch in a worktree. Output: a report, one commit with the agent-fixable fixes, a list of findings that need judgment, and a ledger entry. It merges only when the repo's rules allow it.

For someone else's PR, use `code-review`.

## Steps

In the commands below, `<skill>` is the folder that holds this SKILL.md. Run every command from the repository root, not from the skill folder.

Pin the branch against its base (the default is `origin/HEAD`):

```sh
git fetch -q origin
node <skill>/scripts/agent-review.mjs pin [--base origin/main]
```

The key is the branch name. Commit or stash your own work first. The review covers committed changes only. When the branch has an open PR, `pin` uses its description as the spec.

### Pin the change

Run the context command from the step above. It writes one directory with the diff, changed files, commits, the spec (PR description and linked issues), the repo's `AGENTS.md` and `REVIEW.md`, and the reviewer's axioms when present. It prints `context.json`. Every reviewer reads this directory, so they all see the same inputs.

`context.json` also gives the review `depth` (`quick`, `standard` or `deep`), where it came from (`depthSource`), and a `plan`: the model and thinking level for each reviewer, the verifier tier, and the tie-break models. The depth comes from `--depth`, then the repo's `agent-review.json`, then the user config, then a suggestion from the diff. A path the repo lists in `deepPaths` always makes it deep.

- When the user asks for a quick or a deep review, add `--depth quick` or `--depth deep` to the pin command.
- On Codex, always pin with `--host codex`. A Codex session started from a Tau shell looks like Tau. Elsewhere, when `plan.host` is null, pin again with `--host tau` or `--host claude-code`.
- Before the panel runs, tell the user the depth and its source in one line, and pass on any `plan.warnings`.

Then start a ledger round:

```sh
node <skill>/scripts/agent-review.mjs ledger start --repo <owner/repo> --key <key> --base <mergeBase> --head <head> --lenses <comma-separated lenses> --depth <depth>
```

Take `repo`, `key`, `mergeBase`, `head`, `lenses` and `depth` from `context.json`. `REVIEW.md` rules override the general guidance below.

The ledger allows 3 rounds. After that, `start` refuses, because later rounds mostly find older problems instead of new ones. Stop and tell the user that this change has had 3 reviews, and suggest that the author step back and reconsider the approach. Start another round with `--past-cap` only when the user asks for one.

### Run the panel

Run one reviewer for each entry in `plan.reviewers`, with that entry's `model` and `thinking`, even for a small diff. A small diff only makes each reviewer quicker. When an entry's `model` is null, pick a model of its `tier` yourself and keep at least two model families. Do not review it yourself instead of running the panel. Each reviewer starts with a fresh context, sees only the pinned directory and the repository, and does not see the other reviewers' findings. Get each reviewer's prompt from:

```sh
node <skill>/scripts/agent-review.mjs lens prompt <lens> --context <dir>
```

The plan already spreads the reviewers across at least two model families. Run them this way:

- **Tau:** start the reviewers as parallel subagent tasks, and set each task's `model` and `thinkingLevel` from the plan. Record each model ID as Tau gives it, such as `glean/GPT6_1_SOL`. The ledger reads the provider from the model name, so Claude and GPT behind the `glean/` prefix count as two families.
- **Claude Code:** model IDs are `provider/model`. Start each `anthropic/` reviewer as a subagent, with the part after the slash as its model. Run each `openai/` reviewer with `node <skill>/scripts/agent-review.mjs lens run <lens> --via codex --model <model> --context <dir> --repo-dir <repo>`, passing the model as the plan gives it. `lens run` strips the provider for the CLI and records it once.
- **Codex:** start each `openai/` reviewer as a subagent, and run each `anthropic/` reviewer with `lens run <lens> --via claude --model <model>`.

Without a user config, the plan has no models. Then spread the lenses across at least two families yourself: give about half of them a model from another provider, and run correctness and one other lens on the second family.

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

In a follow-up round, also merge a new finding into an earlier finding it repeats, from `ledger open` or the ledger file. That covers earlier findings that were closed, too: a finding the author called wrong or intended must not come back. A finding marked fixed is the exception. If the same problem turns up again, the fix did not hold, so the report keeps the new finding and points to the old one in `recurs`. `ledger report` refuses while a new finding sits in the same file as an earlier one, on nearby lines or with the same class. Merge it, or pass `--keep <id>` when it is a different bug.

### Verify every finding

A reviewer's finding is a claim, not a fact. For each primary finding, start a fresh verifier: a subagent that did not write the finding, on a model from another family than its author. Get that model and its thinking level from `node <skill>/scripts/agent-review.mjs plan verifier --context <dir> --author <model of the finding>`. Give it the finding, the pinned directory, and the rubric from `node <skill>/scripts/agent-review.mjs rubric show finding-verification`. The verifier reads the code itself. It must show that the precondition can occur, and give the call path or a repro, before it answers `confirmed`. Record its answer:

```sh
node <skill>/scripts/agent-review.mjs ledger decide --repo <repo> --key <key> --id F1 --kind finding-verification --json '{"label":"confirmed","probability":0.85,"model":"<provider/model>","rationale":"..."}'
```

When two reviewers disagree about the same code, or a verifier is unsure (probability from 0.4 to 0.7), get one more opinion from a reviewer on a third model, or on the family that has not seen the finding yet. Get it from `node <skill>/scripts/agent-review.mjs plan tiebreak --context <dir> --exclude <author>,<verifier>`. Show it the claim without its author or the earlier verdicts, and record that answer as the verification decision.

When `plan.secondVerifierOnBlockers` is true (a deep review), verify every finding rated blocker a second time, with another verifier from `plan verifier`. If the two disagree, get a tie-break and record its answer.

The verifier also checks each place in `instances`. Name any that do not hold in its rationale, and leave them out of the report.

For every confirmed finding, also record `finding-severity` (blocker, should-fix or nit), `finding-triage` (agent-fixable or needs-judgment) and `finding-origin` (introduced, missed or pre-existing), using each kind's rubric from `node <skill>/scripts/agent-review.mjs rubric show <kind>`. Only an introduced finding can be a blocker. The report moves a missed or pre-existing blocker to should-fix, and refuses a blocker with no origin.

### Select what to report

```sh
node <skill>/scripts/agent-review.mjs ledger report --repo <repo> --key <key>
```

This keeps confirmed findings at or above the verification threshold (0.7). It gives each one a `section` (blockers, should-fix, pre-existing, smaller) and a number `n` in report order. Each finding's `instances` include the places its duplicates found. The output also gives `counts` per section, `earlierOpen` (earlier findings still open, per section) and a `verdict` (`ready` or `needs-changes`). It lists the IDs it dropped and the model families that took part. It refuses to run while a chosen lens has no recorded run or a finding has no verification. Fix the gap; do not work around it. Use `--allow-missing` only when a lens truly could not run, and name the skipped lenses under **Not checked**. Report only what it returns.

### Apply the agent-fixable findings

For each reported finding that triage marked `agent-fixable`:

1. Make the smallest change that fixes it. Do not refactor nearby code.
2. Add or update a test when the finding is about behavior.
3. Run the repo's checks from `AGENTS.md` (build, tests, lint).

Put all of these fixes in one commit, separate from the work it reviews. Write its message in the repo's commit style about what the fixes change, for example `fix: reject agent files Copilot can't load`, with one line per fix in the body. Do not mention the review or list ledger IDs. If the checks fail and the fix is not clear, revert that fix and move the finding to the needs-judgment list.

Then record each fixed finding:

```sh
node <skill>/scripts/agent-review.mjs ledger dispose --repo <repo> --key <key> --id F3 --as fixed
```

### Write the report

Use this shape, and nothing longer than the content needs:

```markdown
**Verdict:** Needs changes: 1 blocker, 2 should fix. <One sentence that says why.>

**Blockers**

1. `path/file.ts:42` <title>. <scenario in one or two sentences>. <evidence: the call path or repro>. Also at `path/other.ts:7`. (Found by 3 reviewers on 2 model families.)

**Should fix**

2. ...

**Pre-existing** (not from this change)

3. ...

**Smaller items** (at most 5; drop the rest)

4. ...

**Checked:** <depth> review: <lenses run>, on <model families>, at <short head SHA>. <What you ran, such as tests or a repro, or "Read only.">
**Not checked:** <anything a reader might assume you covered but you did not>.
```

Rules for the prose:

- Lead with the verdict that `verdict` gives. It counts findings from earlier rounds that are still open (`earlierOpen`), as well as new ones. Pre-existing and smaller items never hold a PR back.
  - `needs-changes`: `**Verdict:** Needs changes: <blockers> blocker, <should fix> should fix.`, with `counts` and `earlierOpen` added together, then one sentence that says why.
  - `ready` with findings: `**Verdict:** Ready to merge.`, then the counts of what is left, such as `1 pre-existing item, 2 smaller items.`
  - `ready` with no findings: `**Verdict:** Ready to merge. Nothing to fix.` Leave out the finding sections.
- Put each finding in the section the report output gives it. Leave out a section that has no findings. A finding in `unrated` has no severity: record one and run the report again.
- Number the findings 1, 2, 3 in report order, across sections, using `n` from the report output. Leave a blank line between each section heading and its list: without it, a list that starts above 1 renders as plain text. Never show ledger IDs (F1, F2): they mean nothing to anyone else. Keep the map from number to ledger ID for later commands in this conversation, so the user can say "fix 2".
- One finding per item. Give file and line, the scenario, and the evidence. List every other place from `instances` on the same item. Leave out praise and summaries of the diff.
- Mark a finding whose origin is `missed` with "missed in an earlier round". Mark a finding with a non-empty `recurs` with "came back after an earlier fix".
- Put code in backticks: identifiers, calls, paths, `file:line`, commands, flags and values.
- Plain words, short sentences, active voice. No em dashes, no emoji, no "it's worth noting".
- Cite the `REVIEW.md` rule or axiom ID when a finding rests on one.
- Leave out the dropped findings. They stay in the ledger.

Save the report and draft comments to a file and run `node <skill>/scripts/agent-review.mjs prose --github <file>`. Fix each flag, or keep it on purpose (for example, a quoted error message), before you show the report.


Add a **Needs your judgment** section after **Smaller items**. For each needs-judgment finding, give the choice to make and the option you recommend, with one line on why.

### Suggest rules for repeated findings

```sh
node <skill>/scripts/agent-review.mjs ledger summary --repo <repo>
```

`repeatedClasses` lists bug classes found at least 3 times across at least 2 reviews of this repo. For each one, suggest a single line to the user after the report. Its `suggest` field says which kind:

- People fixed it: a rule that prevents it, as an `AGENTS.md` convention or a lint rule.
- People called it wrong, intended or not worth fixing: a `REVIEW.md` line that tells reviewers not to raise it.

Skip a class whose `suggest` is null: people's decisions on it do not lean either way yet. Suggest only. Do not edit those files unless the user asks.

### Draft the PR description

When the branch has no PR yet, draft three sections for its description, from what you ran:

- **Testing:** the commands you ran and what they returned.
- **Risk:** what could break, and how someone would notice.
- **How to revert:** the one step that undoes the change, such as a revert, a flag, or a config value.

Leave the review itself out of the description. Draft only. Opening the PR follows the repo's rules below.

### Before anything leaves this machine

This skill never posts, comments, approves, merges, pushes to the default branch, or publishes on its own. Before any command or tool call that does one of those things, check the repo's rules:

```sh
node <skill>/scripts/agent-review.mjs policy check -- <the exact command>
```

- `allow`: the repo's rules permit it. Go ahead.
- `ask`: ask the user in this conversation, naming the exact action. Go ahead only after they say yes to that action.
- `deny`: do not do it. Tell the user which rule denies it.

A request earlier in the conversation to "review" something is not approval to post the review.

Everything that leaves this machine (commit messages, PR titles and descriptions, comments and replies) is about the change: what it does, why, and how it was tested. Leave out how it was reviewed. No review rounds, reviewer or verifier counts, lenses, models or model families, ledger IDs, or "self-review". That stays in this conversation. Check each of those texts before it goes out:

```sh
node <skill>/scripts/agent-review.mjs prose --github <file>
```

### Merging

Merge only when all of these hold:

- `node <skill>/scripts/agent-review.mjs policy check -- gh pr merge <number>` returns `allow`, or it returns `ask` and the user approves the merge in this conversation. A `deny` is final: no approval overrides it;
- no blockers remain;
- the needs-judgment list is empty, or the user has answered every item.

Otherwise stop after the report and say what is left.

## Done when

- The fix commit exists (or the report says no finding was agent-fixable).
- The needs-judgment list matches the ledger.
- Nothing merged without an `allow` rule or the user's approval.
