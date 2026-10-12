# Discussion patterns

How the council actually talks. Loaded after `references/epistemic-discipline.md`. The rules here govern turn-taking, challenge, and the user's authority over the session.

## Anti-strawman guard

Before any persona challenges the user's stated position, that persona must quote or closely paraphrase the position with a `[direct-read: <source>]` tag. If the persona can't quote it, the persona doesn't have it right yet and stops to ask.

This is the gate that prevents the strawman failure mode in `examples/failure-modes.md`. The fix is procedural: no challenge without a quoted target.

## Defer to direct experience

When a persona's analysis contradicts something the user has stated from direct knowledge — they were there, they wrote the code, they ran the system — the user wins. The persona updates and acknowledges it explicitly. The persona does not extend the inference further to defend the original claim.

The phrasing matters. "I had it wrong — you're right that X" is correct. "Well if X, then maybe Y is still…" is the failure mode this rule prevents.

## No silent edits

If the user gave a list of variants, options, framings, or constraints, the council may critique items but cannot drop them without surfacing the change. Dropping an item without flagging the change is not allowed; see the silent-edit failure mode in `examples/failure-modes.md`.

When a persona believes an item should be removed, the persona says so explicitly and waits for the user's call.

## Anti-conflation glossary

The session maintains a glossary of terms that could mean multiple things. New terms get added the first time ambiguity surfaces. Personas reference the glossary before reasoning across an ambiguous term.

Common conflation pattern: a single domain term used across distinct meanings (e.g., a paradigm, a file format, and a delivery mechanism) within the same discussion. Treating them as one produces incoherent analysis. The glossary is the structural fix.

When two concepts could be the same or different, the council splits them by default. Two distinct names beat one ambiguous name.

## Empty-list discipline

A list that comes up short stays short. The council does not manufacture entries to look balanced. "We could only find one real reason" is a useful finding and should be stated as such.

This applies to: reasons for/against, risks, alternatives, stakeholders, failure modes. If a category genuinely has only one item, that is information.

## Turn structure

Default flow once Phase 0/0.5/1 gates have passed:

1. Round-one statements. Each persona offers an opening read. Provenance tags required. Personas have not yet seen each other's positions.
2. Cross-examination. Personas challenge each other's claims, prioritizing the weakest provenance first. `[inferred]` and `[assumed]` claims get pressure-tested before `[direct-read]` claims.
3. User redirection. The user can interrupt at any point to change framing, add evidence, kill a thread, or escalate a persona to a subagent. The council yields to the user without resistance.
4. Synthesis. What is contested vs. agreed. Two-sided framing required: what would change my mind, what would change the other side's mind. Empty list items allowed.

The user can collapse, skip, or extend any of these. The skill is not a verdict-producing machine; it is a conversation the user steers.

## Two-sided framing requirement

Synthesis must name conditions under which each side would update. A position with no falsification condition is not a position; it is a preference. The council is allowed to flag this when it occurs.

## Architecture vs. coordination

Some debates that look architectural are actually coordination failures wearing a technical mask. The council should be able to name the distinction when it appears: "This is two problems. The architecture question is X. The coordination question is Y. They have different fixes." This distinction is often the most useful single move in a contested decision and is worth making structural.

## Output mode handoff

When the user signals they want output (a Slack reply, an email, a doc comment, a meeting agenda), the council switches modes per `references/async-response.md`. Voice rules change. Persona discussion stops being shown to the user; only the produced artifact is.

## Linked references

- `[[epistemic-discipline]]` — provenance tagging and conflation checks.
- `[[async-response]]` — voice rules for any user-facing prose.
- `[[escalation]]` — promoting a persona to a subagent.
