# skills

[Agent Skills](https://agentskills.io) for coding agents, packaged as the `scalvert` plugin for Claude Code and Codex. Any tool that reads Agent Skills can install the skills directly.

## Skills

### `review-pull-request`

Review someone else's GitHub pull request. Independent reviewers on at least two model families each look through one lens. Every finding is then verified against the code before it is reported. Returns a verdict, findings labeled F1, F2 and so on, and draft line comments. Never posts anything.

### `review-my-changes`

The same review for your own branch. Fixes that have one clear answer go in a separate commit, and the rest are listed for your judgment. Merges only when the repo's rules allow it.

### `re-review-pull-request`

Review only the commits since the last review. Each earlier finding gets a status (fixed, not fixed, or answered), labels never change, and a new blocker must come from the new commits.

### `respond-to-review-comments`

Work through a PR's unresolved review threads. Each claim is verified against the code before anything changes. Valid claims are fixed in the PR that introduced the code. Each thread gets a reply naming the commit, or the evidence that nothing needs to change, and is then resolved. Never posts a top-level comment.

### `write-clearly`

Write or rewrite prose that is plain and reads as if a person wrote it. Includes `check-prose.mjs`, which flags dashes, emoji, title-case headings and phrasing that reads as generated. The review skills run it on their reports.

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

1. **Pin.** `review-context.mjs` writes the diff, changed files, commits, spec, `AGENTS.md`, `REVIEW.md` and optional axioms to one directory. It picks 3 to 6 lenses from what the diff touches.
2. **Panel.** One reviewer per lens, each with a fresh context, spread across model families. `run-lens.mjs` runs a lens on Codex or Claude from any host.
3. **Merge duplicates.** Findings with the same root cause collapse into one. The report shows how many reviewers and model families found it.
4. **Verify.** A fresh verifier on another model checks each finding against the code and records a calibrated probability.
5. **Report.** Only confirmed findings above the threshold are reported. The ledger refuses to report while a chosen lens never ran or a finding is unverified.

Every decision goes into a ledger at `~/.local/state/agent-reviews/reviews/<owner>/<repo>/<pr-or-branch>.json`. `$AGENT_REVIEWS_STATE_DIR` replaces `~/.local/state/agent-reviews`, and `$XDG_STATE_HOME` moves its parent. The old `$SCALVERT_STATE_DIR` still works. Without an explicit state directory override, ledgers written before 0.1.1 stay in `~/.local/state/scalvert` and are still used until `${XDG_STATE_HOME:-$HOME/.local/state}/agent-reviews/reviews` exists. To switch, move `~/.local/state/scalvert/reviews` to `${XDG_STATE_HOME:-$HOME/.local/state}/agent-reviews/reviews`. If you set `$AGENT_REVIEWS_STATE_DIR` or `$SCALVERT_STATE_DIR`, use that directory as the destination parent instead. In a branch name, characters other than letters, digits, `.`, `_` and `-` are percent-encoded, so `feature/x` becomes `feature%2Fx.json`. Later, the same ledger records what a person decided about each finding. `review-ledger.mjs summary` reports findings per review, dismissal rate, model families, and how well the verification probabilities match those decisions (Brier score).

All judgments go through one interface, `classify(kind, input) -> { label, probability }` (`classify.mjs`), so a local or self-hosted classifier can replace the agent's own judgment later.

Taste findings need an axioms file: your own engineering principles, at `$AXIOMS_PATH` or `~/.config/scalvert/axioms.md`. Without one, the taste lens does not run.

`scripts/e2e-review.sh` runs `review-my-changes` in Claude Code against a fixture with three planted bugs and a clean control. It checks recall, that the control gets no blockers, that two model families took part, and that nothing merged.

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
S=plugins/claude/scalvert/scripts/permissions.mjs
node $S preset draft-pr                        # print a preset's rules
node $S check -- gh pr merge 12                # allow, ask or deny here
node $S compile --codex .codex/rules/permissions.rules
node $S shim ~/.local/share/scalvert/shims     # then put that dir first on PATH
```

`scripts/e2e-guardrails.sh` runs Claude Code and Codex against a stub `gh` in a scratch repo and fails if a gated command runs. It needs logged-in CLIs, so it is not part of CI.

## Layout

```
shared/scalvert/skills/<skill>/SKILL.md   authored source; edit here
plugins/claude/scalvert/                  generated Claude Code plugin
plugins/codex/scalvert/                   generated Codex plugin
partials/                                 text shared by skills ({{> name}})
shared/scalvert/scripts/                  scripts, copied into each skill that uses them
.claude-plugin/marketplace.json           generated Claude marketplace
.agents/plugins/marketplace.json          generated Codex marketplace
pluginpack.config.ts                      build config
scripts/                                  repo checks
```

[pluginpack](https://github.com/gleanwork/pluginpack) builds everything under `plugins/` and both marketplace files from `shared/`. Do not edit generated files by hand. Run `npm run build` and commit the result.

## Rules for skills

- Names are kebab-case: lowercase letters, digits and single hyphens. Colons, slashes and periods break at least one host.
- A skill's `name` matches its folder.
- Skills sit directly under `skills/`. Nested skills and category folders are not discovered.
- A name reads correctly on its own, without a plugin prefix, because many tools show the bare name.
- Nothing internal to an employer goes in this repo. It is public.

`npm test` checks all of these, verifies the generated output is current, and validates each target.

## License

MIT. See [LICENSE](LICENSE).
