---
name: debate-a-decision
description: Challenge a position, decision or draft with a steerable panel of expert personas before you commit, send or ship it. Use when asked to poke holes, pressure-test, find what is missing, play devil's advocate, or prepare for a meeting. For a structured, cross-checked readiness verdict, use assess-release-readiness.
triggers:
  - council
  - challenge this
  - punch holes
  - what am I missing
  - poke at this
  - pre-meeting prep
  - adversarial review
---

# Debate a decision

Formerly `council-discussion`.

A steerable roundtable of expert personas that challenges a position with provenance discipline and anti-strawman guards. Distinct from `assess-release-readiness`: this skill runs conversationally and yields to the user; `assess-release-readiness` runs a structured eval to a verdict.

## When to use

- Real-time pushback on a decision, draft, or position.
- Pre-meeting prep where the user wants to surface what they're missing.
- Drafts about to go to a public audience (Slack, doc comment, email, PR body).
- Architectural debates where multiple plausible paths exist and the user wants them stress-tested.

## When NOT to use

- Well-defined coding tasks. Use `executor` or write directly.
- Long-running structured evals. Use `assess-release-readiness`.
- A decision the user has already made and just wants executed. Skill should not insert friction the user didn't ask for.
- Trivial questions. The setup cost is real; don't pay it for a one-line answer.

## Hard preconditions

The skill refuses to start until each of these is satisfied. These are the gates that prevent the failure modes documented in `examples/failure-modes.md`.

1. **Artifacts identified.** What is the user actually reacting to? Doc URLs, Slack threads, code paths, prior conversation. The skill asks if any are missing.
2. **Artifacts read.** Not skimmed, not summarized by the user. Fetched and read directly via `Read`, `gh`, web fetch, or available enterprise-search tools as appropriate. A persona that hasn't read the source is not allowed to opine on it.
3. **Position confirmed.** Restate the user's position back in their own words with quotes from artifacts where possible. Get explicit confirmation or correction before any persona challenges it.

If the user pushes the skill to skip a gate, the skill says so explicitly and notes the increased risk in the transcript. The gates can be waived by the user; they cannot be silently bypassed.

## Phase outline

0. **Artifact pre-research.** Read every linked source. Build provenance log: direct-read facts, inferences, things unknown. See `references/epistemic-discipline.md`.
1. **Epistemic setup.** Open the session glossary. Identify terms at risk of conflation. See `references/epistemic-discipline.md`.
2. **Position confirmation.** Restate the user's position; get explicit confirmation. See `references/discussion-patterns.md` (anti-strawman guard).
3. **Persona selection.** Auto-select 3-5 personas based on topic. User can override. See `references/personas.md`.
4. **Round-one statements.** Each persona offers an opening read. Provenance tags required.
5. **Cross-examination.** Personas challenge each other, weakest provenance first.
6. **Synthesis.** Contested vs. agreed. Two-sided falsification framing required. Empty list items allowed.
7. **Output mode (optional).** User picks: internal note, async public response, meeting agenda, or further discussion. See `references/async-response.md`.

The user can collapse, skip, or extend any phase. The phases are a default rhythm, not a forced march.

## Reference files

- `references/epistemic-discipline.md` — provenance tagging, confidence-to-language mapping, conflation checks, stop conditions.
- `references/discussion-patterns.md` — anti-strawman guard, defer-to-direct-experience, no silent edits, turn structure.
- `references/personas.md` — shared system-prompt block, persona library, schema.
- `references/escalation.md` — promoting a persona to a subagent for deep investigation.
- `references/async-response.md` — voice rules for any user-facing prose.
- `references/transcript-format.md` — what gets logged where.
- `examples/failure-modes.md` — specific failures from the originating session, as test cases.
- `examples/orchestration-layer-debate.md` — worked example of the skill running end-to-end.
