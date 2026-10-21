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

Do not merge a new finding into one from an earlier round, and do not drop it. The report marks a new finding that may repeat an earlier one, by location and bug class, and leaves the call to a person.

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

It gives each reported finding a `section` (blockers, should-fix, pre-existing, smaller) and a number `n` in report order. Each finding's `instances` include the places its duplicates found. `repeatOf` lists earlier findings it may repeat that are still open or that a person waved off, and `recurs` lists earlier findings marked fixed that it matches. The output also gives:

- `counts` per section, and `earlierOpen`: findings from earlier rounds that are still open, per section.
- A `verdict`: `ready`, `needs-changes`, or `needs-a-person` when something waits on a person.
- `waiting`: what a person must settle, such as a disputed finding, a change to the review policy, or a finding triaged `needs-judgment`.
- `rejected`: changes a person rejected, such as an edit to the review policy. Each one holds the change.
- `repeats`: the numbers of the findings that have a `repeatOf`.
- `dropped`, `merged`, and the model `families` that took part.

Report only what it returns.
