# skills

[Agent Skills](https://agentskills.io) for coding agents, packaged as the `scalvert` plugin for Claude Code and Codex. Any tool that reads Agent Skills can install the skills directly.

## Skills

### `self-review`

Review your own branch before anyone else does. Independent reviewers on at least two model families each look through one lens. Every finding is then verified against the code before it is reported. Fixes that have one clear answer go in a separate commit, and the rest are listed for your judgment. Merges only when the repo's rules allow it.

### `code-review`

The same review for someone else's GitHub pull request. Returns a verdict, numbered findings, and draft line comments in GitHub Markdown. Never posts anything. Run it again after the author pushes: it reviews only the new commits, gives each earlier finding a status (fixed, not fixed, or answered) with a reply for its review thread, and raises a new blocker only for a problem the new commits introduce. The ledger tracks findings by internal IDs that never appear in posted text.

### `address-review-comments`

Work through a PR's unresolved review threads. Each claim is verified against the code before anything changes. Valid claims are fixed in the PR that introduced the code. Each thread gets a reply naming the commit, or the evidence that nothing needs to change, and is then resolved. Never posts a top-level comment.

### `write-clearly`

Write or rewrite prose that is plain and reads as if a person wrote it. Includes `agent-review prose`, which flags dashes, emoji, title-case headings and phrasing that reads as generated. The review skills run it on their reports. `agent-review prose --github` also checks text bound for GitHub: it flags code outside backticks, ledger IDs, unbalanced backticks and code blocks with no language.

### `assess-release-readiness`

Assess whether a release, milestone, merge or package is ready. A panel of specialist agents reviews the same subject independently, then the agents cross-check each other's findings and agree on one prioritized report. Formerly `agent-council`.

### `debate-a-decision`

Challenge a position, decision or draft before you commit, send or ship it. Expert personas (distinguished engineer, system designer, political realist, skeptic) take turns pressure-testing the position with sourced claims, and the conversation stays steerable. Formerly `council-discussion`.

## Install

Claude Code, inside a session:

```text
/plugin marketplace add https://github.com/scalvert/skills
/plugin install scalvert@scalvert
```

Codex:

```sh
codex plugin marketplace add https://github.com/scalvert/skills
codex plugin add scalvert@scalvert
```

Any Agent Skills tool, with [skills.sh](https://skills.sh):

```sh
npx skills add scalvert/skills
npx skills add scalvert/skills --skill debate-a-decision
```

## How a review works

The [review harness](https://github.com/scalvert/agent-review), bundled into each skill, runs every review. It records each step in the review's history and refuses a step that is skipped or does not hold, with every reason: a reviewer slot that never ran, a single model family, a verifier from the author's family, a finding with no rating. `agent-review review next` says what the next step is, and whether it waits on an agent or a person, so a person and an agent can share a review, and a new session picks up where the last one stopped. Some steps are only a person's: accepting a missing reviewer, settling a dispute between verifiers, clearing a blocker or should-fix, and going past the round cap.

1. **Pin.** `agent-review pin` writes the diff, changed files, commits, spec, `AGENTS.md`, `REVIEW.md` and optional axioms to one directory. It picks 3 to 6 lenses from what the diff touches.
2. **Panel.** One reviewer per lens, each with a fresh context, spread across model families. Each finding names its bug class and lists every place the same mistake occurs. `agent-review lens run` runs a lens on Codex or Claude from any host.
3. **Merge duplicates.** Findings with the same root cause collapse into one. The report shows how many reviewers and model families found it. In a follow-up round, the report leaves out a finding that repeats an earlier one that is still open or that a person called wrong, intended or not worth fixing.
4. **Verify.** A fresh verifier on another model checks each finding against the code and records a calibrated probability. It also records where the problem came from: introduced by the change, missed in an earlier round, or older than the change. When two verifiers disagree, a person decides.
5. **Report.** Only confirmed findings above the threshold are reported, in sections: blockers, should fix, pre-existing and smaller items. Only a problem the change introduced can be a blocker. The harness refuses to report while a finding is unverified, or a reported finding has no severity or origin.

A review has to converge. The review policy allows 3 rounds per PR or branch, and then asks the author to step back and reconsider the approach. Only a person can start a fourth. `code-review` follow-ups review only the new commits, and nits stay out of posted comments. A problem that comes back after it was marked fixed is reported again. These follow the [Claude Code team's own review changes](https://claude.dev/blog/solving-code-review-at-anthropic/), which cut their mean reviews per PR from 2.08 to 1.32.

### Depth and models

A review runs at one of three depths. Each depth sets which lenses run, and which model tier and thinking level each role gets. Reviewers decide what gets found, and verifiers decide what gets reported, so `standard` spends the strong tier on verification and on the correctness and security lenses.

| | `quick` | `standard` (default) | `deep` |
|---|---|---|---|
| Lenses | 3 | 3 to 6, picked from the diff | every lens that can apply |
| Reviewers | fast tier | fast, but strong for correctness and security | strong tier |
| Verifiers | fast tier | strong tier | strong, and a second verifier on each blocker |
| Thinking | low | medium, and high for verifiers | high |

Every depth keeps at least two model families, and a verifier always comes from a different family than the finding's author.

The depth comes from, first match wins: `--depth` or a request such as "do a quick review", the repo's `agent-review.json`, the user config, then a suggestion from the diff (`quick` for a small docs-only change). A changed path that matches the repo's `deepPaths` always makes the review deep. The repo file is read from the merge base, so a change cannot lower its own review:

```json
{ "review": { "depth": "standard", "deepPaths": ["src/auth/**", ".github/workflows/**"] } }
```

Models are personal and host-specific, so they live in the user config at `~/.config/agent-reviews/config.json` (or `$AGENT_REVIEWS_CONFIG`), never in a repo. Model IDs are `provider/model`. On Claude Code, `anthropic/` models run as subagents and `openai/` models run through Codex:

```json
{
  "depth": "standard",
  "hosts": {
    "claude-code": {
      "fast": ["anthropic/sonnet", "openai/gpt-5.4-mini"],
      "strong": ["anthropic/opus", "openai/gpt-5.5"]
    }
  }
}
```

`tiebreak` is optional: list a third family when the host can run one. `pin` writes the resolved plan into `context.json`, and `agent-review plan show`, `plan verifier` and `plan tiebreak` read it. Without a user config, the plan has no models, and the agent picks them as before. The ledger records the depth of each round and the model behind each finding, so `ledger summary` shows noise and fixes by depth and by model.

A repo sets its review policy in `agent-review.json` at its root: the depth, paths that always get a deep review, the number of reviewers and model families, and the round cap. The harness reads it from the tip of the target branch, so a change cannot weaken its own review. See the harness's [policy reference](https://github.com/scalvert/agent-review/blob/main/docs/policy.md).

Every step goes into the review's history at `~/.local/state/agent-reviews/v2/<owner>/<repo>/<pr-or-branch>/events.jsonl`. A review from before the harness, in a ledger at `~/.local/state/agent-reviews/reviews/<owner>/<repo>/<pr-or-branch>.json`, is copied into the history the first time the harness reads it, and the ledger is left as it was. `$AGENT_REVIEWS_STATE_DIR` replaces `~/.local/state/agent-reviews`, and `$XDG_STATE_HOME` moves its parent. The old `$SCALVERT_STATE_DIR` still works. Without an explicit state directory override, ledgers written before 0.1.1 stay in `~/.local/state/scalvert` and are still used until `${XDG_STATE_HOME:-$HOME/.local/state}/agent-reviews/reviews` exists. To switch, move `~/.local/state/scalvert/reviews` to `${XDG_STATE_HOME:-$HOME/.local/state}/agent-reviews/reviews`. If you set `$AGENT_REVIEWS_STATE_DIR` or `$SCALVERT_STATE_DIR`, use that directory as the destination parent instead. In a branch name, characters other than letters, digits, `.`, `_` and `-` are percent-encoded, so `feature/x` becomes `feature%2Fx.json`. Later, the same history records what a person decided about each finding. A person's decision is one of `fixed`, `accepted` (will fix), `wrong`, `intended` or `not-worth-it`. `agent-review ledger summary` reads both the histories and the older ledgers, and reports findings per review, rounds per review, the noise rate overall and per lens, model families, and how well the verification probabilities match those decisions (Brier score). It also lists bug classes that keep coming back in a repo, so the skills can suggest a rule: an `AGENTS.md` convention or lint rule when people fix them, a `REVIEW.md` line when people wave them off.

All judgments go through one interface, `classify(kind, input) -> { label, probability }` (`cli/src/classify.mjs`), so a local or self-hosted classifier can replace the agent's own judgment later.

Taste findings need an axioms file: your own engineering principles, at `$AXIOMS_PATH` or `~/.config/scalvert/axioms.md`. Without one, the taste lens does not run.

`scripts/e2e-review.sh` runs `self-review` in Claude Code against a fixture with three planted bugs and a clean control. It checks recall, that the control gets no blockers, that two model families took part, and that nothing merged.

## Guardrails

A repo's rules decide what an agent may do there without asking: comment on or merge a PR, publish, release, or push to the default branch. Rules use Claude Code's permission syntax in the repo's `.claude/settings.json`. There is no cross-agent standard for permission files yet, and Claude's format is the most widely copied, so this adds no format of its own. A repo with no rules gets the `draft-pr` preset.

| Preset | Agents may | Agents ask first for |
|---|---|---|
| `local-only` | work locally | any push or PR |
| `draft-pr` | push feature branches, open draft PRs | comment, review, merge, release, publish, force push, push to the default branch |
| `self-merge` | the above, plus merge and mark ready | comment, review, release, publish, force push, push to the default branch |

Each host enforces the rules with its own permission system:

- **Claude Code** reads the rules natively. The plugin's `PreToolUse` hook adds two checks rules cannot express: a bare `git push` on the default branch, and `gh api` calls that write.
- **Codex** gets prefix rules compiled into `.codex/rules/permissions.rules`, which Codex loads once the project is trusted. The plugin hook covers wildcard and MCP rules where Codex runs plugin hooks. A Codex hook can deny but not ask.
- **Tau** has no hook for this yet. PATH shims for `gh`, `git`, `npm`, `pnpm` and `yarn` check the rules only in an agent shell (`PI_SESSION_ID` set). An agent can bypass a shim with an absolute path, so treat it as a speed bump.

```sh
S=plugins/claude/scalvert/scripts/agent-review.mjs
node $S policy preset draft-pr                 # print a preset's rules
node $S policy check -- gh pr merge 12         # allow, ask or deny here
node $S policy compile --codex .codex/rules/permissions.rules
node $S policy shim ~/.local/share/scalvert/shims   # then put that dir first on PATH
```

`scripts/e2e-guardrails.sh` runs Claude Code and Codex against a stub `gh` in a scratch repo and fails if a gated command runs. It needs logged-in CLIs, so it is not part of CI.

## Layout

```
shared/scalvert/skills/<skill>/SKILL.md   authored source; edit here
plugins/claude/scalvert/                  generated Claude Code plugin
plugins/codex/scalvert/                   generated Codex plugin
partials/                                 text shared by skills ({{> name}})
cli/src/                                  agent-review CLI and guard source; edit here
shared/scalvert/scripts/                  generated bundles and lenses, copied into each skill that uses them
.claude-plugin/marketplace.json           generated Claude marketplace
.agents/plugins/marketplace.json          generated Codex marketplace
pluginpack.config.ts                      build config
scripts/                                  repo checks
```

[pluginpack](https://github.com/gleanwork/pluginpack) builds everything under `plugins/` and both marketplace files from `shared/`. Before that, `scripts/build-cli.mjs` bundles `cli/src/` with esbuild into `shared/scalvert/scripts/`, and `scripts/sync-skill-scripts.mjs` copies the bundle into each skill. Run `node shared/scalvert/scripts/agent-review.mjs --help` for every command. Do not edit generated files by hand. Run `npm run build` and commit the result.

## Rules for skills

- Names are kebab-case: lowercase letters, digits and single hyphens. Colons, slashes and periods break at least one host.
- A skill's `name` matches its folder.
- Skills sit directly under `skills/`. Nested skills and category folders are not discovered.
- A name reads correctly on its own, without a plugin prefix, because many tools show the bare name.
- Nothing internal to an employer goes in this repo. It is public.

`npm test` checks all of these, verifies the generated output is current, and validates each target.

## License

MIT. See [LICENSE](LICENSE).
