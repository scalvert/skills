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

### How the review is enforced

The review harness runs this review. It records every step in the review's history, and each command checks what the step needs: the right commit, a complete panel, an independent verifier, every finding rated. A skipped or invalid step is refused, with every reason. Fix what the reasons name, then run the command again. Never work around a refusal, and never edit the review's files by hand.

After any step, and whenever you are unsure where the review stands, ask the harness:

```sh
node <skill>/scripts/agent-review.mjs review next --repo <repo> --key <key>
```

It prints the next step in `action`, and whether it waits on an agent or a person in `waitingOn`. Do what it names. When it waits on a person, stop and tell the user what it needs, from `human`. A person and an agent can hand the review back and forth at any step, and a new session picks up where the last one stopped.

Every command that changes the review takes `--actor agent:<runtime>`, such as `agent:claude-code`, `agent:codex` or `agent:tau`. A person runs the same commands with `--actor human:<name>`. Some steps are a person's call, and the harness refuses them from an agent: accepting a missing reviewer, settling a dispute, going past the round cap, and clearing a blocker or should-fix as `wrong`, `intended` or `not-worth-it`. For these, show the user what to decide and the command. Pass `--actor human:<their name>` only to record a decision the user made in this conversation, and only that decision. Never decide one yourself and record it as theirs.

Output is JSON. A refused step exits 1 and prints `{"error": {"code", "message", "reasons"}}` on stderr.

### Pin the change

Run the context command from the step above. It writes one directory with the diff, changed files, commits, the spec (PR description and linked issues), the repo's `AGENTS.md` and `REVIEW.md`, and the reviewer's axioms when present. It prints `context.json`. Every reviewer reads this directory, so they all see the same inputs.

`context.json` also gives the review `depth` (`quick`, `standard` or `deep`), where it came from (`depthSource`), and a `plan`: the model and thinking level for each reviewer, the verifier tier, and the tie-break models. The depth comes from `--depth`, then the repo's review policy (`agent-review.json`), then the user config, then a suggestion from the diff. The policy's `minDepth` and `deepPaths` can raise it.

- When the user asks for a quick or a deep review, add `--depth quick` or `--depth deep` to the pin command.
- On Codex, always pin with `--host codex`. A Codex session started from a Tau shell looks like Tau. Elsewhere, when `plan.host` is null, pin again with `--host tau` or `--host claude-code`.
- Before the panel runs, tell the user the depth and its source in one line, and pass on any `plan.warnings`.

### Start the round

```sh
node <skill>/scripts/agent-review.mjs review start --repo <repo> --key <key> --head <head> --lenses <comma-separated lenses> --depth <depth> --actor <actor>
```

Take `repo`, `key`, `head`, `lenses` and `depth` from `context.json`. The harness binds the round to that exact head, the merge base, and the review policy at the tip of the target branch, so a change cannot weaken its own review. `--target` defaults to the remote's default branch. For a pull request into another branch, pass `--target origin/<base branch>`. `REVIEW.md` rules override the general guidance below.

- `review start` prints `next`, the same as `review next`. If its `depth` is higher than the depth in `context.json`, the target branch's policy raised it. Pin again with `--depth <that depth>`, and use the new plan.
- `review start` with the same head returns the current round. A new head starts a new round, and nothing from the old round counts toward it.
- The policy allows 3 rounds by default. After that, `start` refuses with `round-cap`, because later rounds mostly find older problems instead of new ones. Stop and tell the user that this change has had that many reviews, and suggest that the author step back and reconsider the approach. Only a person can start another round, with `--past-cap`.
- `review start` may open escalations, for example when the change edits the review policy. They wait on a person. The panel still runs.

### Run the panel

`review next` lists the reviewer slots to run: one per lens, and more when the policy needs more reviewers or model families. Run one reviewer for each slot, with the model and thinking level of the plan's entry for that lens, even for a small diff. A small diff only makes each reviewer quicker. When an entry's `model` is null, pick a model of its `tier` yourself. A slot the plan has no entry for, such as `correctness-2`, runs the same lens on a model family the panel does not have yet. Do not review it yourself instead of running the panel. Each reviewer starts with a fresh context, sees only the pinned directory and the repository, and does not see the other reviewers' findings. Get each reviewer's prompt from:

```sh
node <skill>/scripts/agent-review.mjs lens prompt <lens> --context <dir>
```

The plan already spreads the reviewers across at least two model families. Run them this way:

- **Tau:** start the reviewers as parallel subagent tasks, and set each task's `model` and `thinkingLevel` from the plan. Record each model ID as Tau gives it, such as `glean/GPT6_1_SOL`. The review reads the family from the model name, so Claude and GPT behind the `glean/` prefix count as two families.
- **Claude Code:** model IDs are `provider/model`. Start each `anthropic/` reviewer as a subagent, with the part after the slash as its model. Run each `openai/` reviewer with `node <skill>/scripts/agent-review.mjs lens run <lens> --via codex --model <model> --context <dir> --repo-dir <repo>`, passing the model as the plan gives it. `lens run` strips the provider for the CLI and records it once.
- **Codex:** start each `openai/` reviewer as a subagent, and run each `anthropic/` reviewer with `lens run <lens> --via claude --model <model>`.

Without a user config, the plan has no models. Then spread the lenses across at least two families yourself: give about half of them a model from another provider, and run correctness and one other lens on the second family.

Wait for every reviewer to return before the next step, and do the same for verifiers. Never end your turn while a subagent is still running: in a non-interactive session, ending the turn ends the review.

Each reviewer returns a JSON array of findings: `file`, `line`, `title`, `precondition`, `scenario`, `evidence`, `axiom` for taste findings, `class` (the kind of bug, in kebab-case), and `instances` (every other place with the same mistake, as `{ "file", "line" }`). Save each reviewer's array to a file, and record the run, including a reviewer that found nothing:

```sh
node <skill>/scripts/agent-review.mjs review run --repo <repo> --key <key> --slot <slot> --status ok --model <provider/model> --findings <findings.json> --head <head> --actor <actor>
```

When a reviewer fails or times out, record it with `--status failed --reason "<why>"`, and run it again. If it cannot run at all, say so, and stop: only a person can let the panel go ahead without it (`review accept-gap`). If no second family is available, the harness refuses to move on. Do not present a single-family review as cross-checked.

When every slot has run, move on:

```sh
node <skill>/scripts/agent-review.mjs review advance --repo <repo> --key <key> --actor <actor>
```

### Merge duplicates

Reviewers often find the same problem. Group findings that share a root cause: same file, nearby lines, and the same failing scenario. Keep the clearest one as the primary, and merge the rest into it, before anyone verifies them:

```sh
node <skill>/scripts/agent-review.mjs review merge --repo <repo> --key <key> --into F1 --ids F4,F7 --actor <actor>
```

`review status` lists the findings and their IDs. The duplicates stay in the history, and the report shows how many reviewers and model families found the problem. Merge only true duplicates. Two different bugs on the same line stay separate.

Do not merge a new finding into one from an earlier round. The report handles that. It leaves out a new finding that repeats an earlier one that is still open, or one a person called wrong, intended or not worth fixing. It keeps a finding that comes back after an earlier fix, and marks it.

### Verify every finding

A reviewer's finding is a claim, not a fact. For each primary finding, start a fresh verifier: a subagent that did not write the finding, on a model from another family than its author. The harness refuses a decision from the author's own model or family. Get the model and its thinking level from `node <skill>/scripts/agent-review.mjs plan verifier --context <dir> --author <model of the finding>`. Give it the finding, the pinned directory, and the rubric from `node <skill>/scripts/agent-review.mjs rubric show finding-verification`. The verifier reads the code itself. It must show that the precondition can occur, and give the call path or a repro, before it answers `confirmed`. Record its answer:

```sh
node <skill>/scripts/agent-review.mjs review decide --repo <repo> --key <key> --finding F1 --kind finding-verification --label confirmed --probability 0.85 --rationale-file <file> --verifier-model <provider/model> --head <head> --actor <actor>
```

Use `--rationale-file` for anything longer than a few words, or for text copied from code or GitHub.

The report keeps a confirmed finding only when every verifier's probability is at or above the policy's threshold (0.7 by default). Record what each verifier says, even when it is unsure. Do not look for a second verifier to raise a low number.

When two verifiers disagree, the harness sends the finding to a person. It does not pick a side, and neither should you. When `plan.secondVerifierOnBlockers` is true (a deep review), or the policy asks for it, verify every finding rated blocker a second time, with another verifier from `plan verifier`.

The verifier also checks each place in `instances`. Name any that do not hold in its rationale. The report leaves them out.

For every confirmed finding, and every disputed one, also record `finding-severity` (blocker, should-fix or nit), `finding-triage` (agent-fixable or needs-judgment) and `finding-origin` (introduced, missed or pre-existing), using each kind's rubric from `node <skill>/scripts/agent-review.mjs rubric show <kind>`. Each comes from a model independent of the finding's author, as verification does. Only an introduced finding can be a blocker: the report moves a missed or pre-existing blocker to should-fix.

### Select what to report

```sh
node <skill>/scripts/agent-review.mjs review report --repo <repo> --key <key> --actor <actor>
```

The harness refuses while a finding has no verification, or a reported or disputed finding has no severity or origin, and names each gap. Fix the gap; do not work around it. Then get the report to present:

```sh
node <skill>/scripts/agent-review.mjs findings report --repo <repo> --key <key>
```

It gives each reported finding a `section` (blockers, should-fix, pre-existing, smaller) and a number `n` in report order. Each finding's `instances` include the places its duplicates found. The output also gives:

- `counts` per section, and `earlierOpen`: findings from earlier rounds that are still open, per section.
- A `verdict`: `ready`, `needs-changes`, or `needs-a-person` when an escalation is open.
- `waiting`: what a person must settle, such as a disputed finding or a change to the review policy.
- `repeats`: new findings left out because they repeat an earlier one.
- `dropped`, `merged`, and the model `families` that took part.

Report only what it returns.

### Apply the agent-fixable findings

For each reported finding that triage marked `agent-fixable`:

1. Make the smallest change that fixes it. Do not refactor nearby code.
2. Add or update a test when the finding is about behavior.
3. Run the repo's checks from `AGENTS.md` (build, tests, lint).

Put all of these fixes in one commit, separate from the work it reviews, titled `fix: address self-review findings`. List the findings by title in the body, not by finding ID. If the checks fail and the fix is not clear, revert that fix and move the finding to the needs-judgment list.

Then record each fixed finding:

```sh
node <skill>/scripts/agent-review.mjs review dispose --repo <repo> --key <key> --finding F3 --as fixed --actor <actor>
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
  - `needs-a-person`: `**Verdict:** Needs a decision from a person.`, then one line for each item in `waiting`: what is disputed or changed, and what the person must decide. Then the findings as usual.
- Put each finding in the section the report output gives it. Leave out a section that has no findings. A finding in `unrated` has no severity: record one and run the report again.
- When `repeats` is not empty, add one line after the findings: `Left out <n> findings that repeat earlier ones.`
- Number the findings 1, 2, 3 in report order, across sections, using `n` from the report output. Leave a blank line between each section heading and its list: without it, a list that starts above 1 renders as plain text. Never show finding IDs (F1, F2): they mean nothing to anyone else. Keep the map from number to finding ID for later commands in this conversation, so the user can say "fix 2".
- One finding per item. Give file and line, the scenario, and the evidence. List every other place from `instances` on the same item. Leave out praise and summaries of the diff.
- Mark a finding whose origin is `missed` with "missed in an earlier round". Mark a finding with a non-empty `recurs` with "came back after an earlier fix".
- Put code in backticks: identifiers, calls, paths, `file:line`, commands, flags and values.
- Plain words, short sentences, active voice. No em dashes, no emoji, no "it's worth noting".
- Cite the `REVIEW.md` rule or axiom ID when a finding rests on one.
- Leave out the dropped findings. They stay in the review's history.

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

Draft only. Opening the PR follows the repo's rules below.

### Before anything leaves this machine

This skill never posts, comments, approves, merges, pushes to the default branch, or publishes on its own. Before any command or tool call that does one of those things, check the repo's rules:

```sh
node <skill>/scripts/agent-review.mjs policy check -- <the exact command>
```

- `allow`: the repo's rules permit it. Go ahead.
- `ask`: ask the user in this conversation, naming the exact action. Go ahead only after they say yes to that action.
- `deny`: do not do it. Tell the user which rule denies it.

A request earlier in the conversation to "review" something is not approval to post the review.

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
