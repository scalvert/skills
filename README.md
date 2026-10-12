# skills

[Agent Skills](https://agentskills.io) for coding agents, packaged as the `scalvert` plugin for Claude Code and Codex. Any tool that reads Agent Skills can install the skills directly.

## Skills

### `council-discussion`

Real-time multi-perspective challenge of a position, decision, or draft. Use when you want expert pushback before committing, sending, or shipping. Optimized for steerable conversation, not long-running structured evaluation.

Personas (distinguished engineer, system designer, political realist, skeptic) take turns pressure-testing the user's position with provenance-tagged claims. Includes anti-strawman guards, conflation checks, and an output mode that strips LLM-tell phrasing before delivery.

### `agent-council`

Structured protocol for comprehensive evaluations that require multiple expert perspectives, cross-validation of findings, and a collective discussion phase before results are presented. Agents all assess the same subject from different angles, then discuss each other's findings to surface blind spots and converge on a consensus.

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
npx skills add scalvert/skills --skill council-discussion
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
