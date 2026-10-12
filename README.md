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
