# skills

[Agent Skills](https://agentskills.io) for coding agents, packaged as the `scalvert` plugin for Claude Code and Codex. Any tool that reads Agent Skills can install the skills directly.

## Skills

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
```

Then install `scalvert` from the Codex plugin picker.

Any Agent Skills tool, with [skills.sh](https://skills.sh):

```sh
npx skills add scalvert/skills
npx skills add scalvert/skills --skill debate-a-decision
```

## Guardrails

A repo's rules decide what an agent may do there without asking: comment on or merge a PR, publish, release, or push to the default branch. Rules use Claude Code's permission syntax in the repo's `.claude/settings.json`. There is no cross-agent standard for permission files yet, and Claude's format is the most widely copied, so this adds no format of its own. A repo with no rules gets the `draft-pr` preset.

| Preset | Agents may | Agents ask first for |
|---|---|---|
| `local-only` | work locally | any push or PR |
| `draft-pr` | push feature branches, open draft PRs | comment, review, merge, release, publish, force push, push to the default branch |
| `self-merge` | the above, plus merge and mark ready | comment, review, release, publish, force push, push to the default branch |

Each host enforces the rules with its own permission system:

- **Claude Code** reads the rules natively. The plugin's `PreToolUse` hook adds two checks rules cannot express: a bare `git push` on the default branch, and `gh api` calls that write.
- **Codex** gets prefix rules compiled into `.codex/rules/scalvert.rules`, which Codex loads once the project is trusted. The plugin hook covers wildcard and MCP rules where Codex runs plugin hooks. A Codex hook can deny but not ask.
- **Tau** has no hook for this yet. PATH shims for `gh`, `git`, `npm`, `pnpm` and `yarn` check the rules only in an agent shell (`PI_SESSION_ID` set). An agent can bypass a shim with an absolute path, so treat it as a speed bump.

```sh
S=plugins/claude/scalvert/scripts/permissions.mjs
node $S preset draft-pr                        # print a preset's rules
node $S check -- gh pr merge 12                # allow, ask or deny here
node $S compile --codex .codex/rules/scalvert.rules
node $S shim ~/.local/share/scalvert/shims     # then put that dir first on PATH
```

`scripts/e2e-guardrails.sh` runs Claude Code and Codex against a stub `gh` in a scratch repo and fails if a gated command runs. It needs logged-in CLIs, so it is not part of CI.

## Layout

```
shared/scalvert/skills/<skill>/SKILL.md   authored source; edit here
plugins/claude/scalvert/                  generated Claude Code plugin
plugins/codex/scalvert/                   generated Codex plugin
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
