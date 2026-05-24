# skills

Personal collection of [Agent Skills](https://agentskills.io) for Claude Code and other compatible agent runtimes.

## Skills

### `council-discussion`

Real-time multi-perspective challenge of a position, decision, or draft. Use when you want expert pushback before committing, sending, or shipping. Optimized for steerable conversation, not long-running structured evaluation.

Personas (distinguished engineer, system designer, political realist, skeptic) take turns pressure-testing the user's position with provenance-tagged claims. Includes anti-strawman guards, conflation checks, and an output mode that strips LLM-tell phrasing before delivery.

Triggers: `council`, `challenge this`, `punch holes`, `what am I missing`, `pre-meeting prep`, `adversarial review`.

### `agent-council`

Structured protocol for comprehensive evaluations that require multiple expert perspectives, cross-validation of findings, and a collective discussion phase before results are presented. Distinct from basic parallel dispatch: agents all assess the *same* subject from different angles, then discuss each other's findings to surface blind spots and converge on a consensus.

Triggers: `evaluate`, `assess`, `audit`, `deep-dive`, `review`, `run the agent council`, `multi-agent evaluation`, `independent assessment panel`.

## Installation

Install both skills with [skills.sh](https://skills.sh):

```sh
npx skills add scalvert/skills
```

Or install a single skill:

```sh
npx skills add scalvert/skills/council-discussion
npx skills add scalvert/skills/agent-council
```

## Layout

```
skills/
├── council-discussion/
│   ├── SKILL.md
│   ├── references/
│   └── examples/
└── agent-council/
    ├── SKILL.md
    ├── references/
    └── examples/
```

Each skill follows the canonical [Agent Skills layout](https://agentskills.io/specification): `SKILL.md` is the entry point, `references/` holds progressive-disclosure documentation that gets loaded on demand, and `examples/` holds worked walkthroughs the agent can study.

## License

MIT. See [LICENSE](LICENSE).
