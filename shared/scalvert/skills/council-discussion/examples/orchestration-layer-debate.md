# Worked example: orchestration-layer debate

A walkthrough showing what a council session looks like running end-to-end on a contested architectural decision. The scenario is fictional; the structural patterns it demonstrates apply broadly to debates between teams whose work overlaps.

## Setup

**Trigger:** The user is TL of the team that owns a job-orchestration primitive (call it "JobRunner"). Another team owns a higher-level wrapper SDK ("FlowKit") that has been positioned as the recommended integration path for new pipelines. The user has a 30-minute meeting with the FlowKit team. An internal benchmark measured 25–30% latency overhead going through FlowKit on production paths. The user has a doc proposing JobRunner-direct as the default integration path, with FlowKit as opt-in convenience.

**User invocation:** "council-discussion: pre-meeting prep on the JobRunner vs FlowKit decision."

## Phase 0: Artifact pre-research

The skill identifies and reads:

- The user's proposal doc
- FlowKit team's design doc
- The latest benchmark results
- The Slack thread where FlowKit was announced as the recommended path
- An RFC on integration patterns from the platform team
- A team chat thread where the question first surfaced

Provenance log opened. Every claim made later in the session points back to a specific artifact and timestamp.

Not read in initial pass: marketing material, generic protocol docs, unrelated retros. Flagged as `[unknown]` if referenced.

## Phase 0.5: Epistemic setup

Glossary opened with three at-risk terms:

- **integration** — the API surface (technical), the recommendation in onboarding docs (organizational), or the wrapper SDK (product). Different decisions; treating them as one is the conflation pattern.
- **FlowKit** — the SDK itself, the team that builds it, or the recommended path the team has been advocating in public channels.
- **the right path** — performance-optimal, ergonomic for new developers, or aligned with the company's broader platform direction.

Provenance levels named. Stop conditions named.

## Phase 1: Position confirmation

Skill restates the user's position from their doc:

> "FlowKit is valuable for some use cases but should not be the default integration path. The benchmark shows 25–30% latency overhead at equivalent functionality, measured in production paths. The recommendation that FlowKit should be the default came from the FlowKit team without coordinating with the JobRunner team. The right composition is JobRunner-direct as the default, with FlowKit as an opt-in convenience layer for use cases where the overhead doesn't matter."

Skill confirms with the user. The user clarifies one detail: the position is not opposition to FlowKit existing or being available; it is opposition to FlowKit being positioned as the default. The skill updates the restatement and confirms again.

**Anti-strawman guard satisfied** before personas engage.

## Phase 2: Persona selection and round-one

Auto-selected: distinguished-engineer, system-designer, skeptic, political-realist (org signals are present in the artifacts).

### distinguished-engineer

> The benchmark is the strongest piece of evidence in this whole pile [direct-read: latency benchmark results]. 25–30% overhead at equivalent functionality, on the production critical path, against the version without the wrapper. That's a measured empirical result, not an opinion. Wrappers that add measurable cost on the critical path tend to accumulate; once they're the default, removing them is a multi-quarter project. Stop the accumulation now while there's still a clean path.

### system-designer

> The question is who owns the integration surface [inferred from: comparison of the FlowKit announcement and JobRunner team's onboarding docs]. The user's team owns the primitive but the FlowKit team has been positioning their wrapper as the recommended path. That's not a code question; it's an authority question. New developers find whichever onboarding docs they hit first, and follow whichever default they see. When two teams point at different defaults, integrators don't pick the technically correct one — they pick whichever is more visible. The benchmark wins in a head-to-head; visibility decides the head-to-head.

### skeptic

> [The skeptic persona is unfilled in the current skill; in a real session it would speak here. The schema in `references/personas.md` shows what fields the persona would draw on.]

### political-realist

> Two things at once here. The architectural question is whether FlowKit should be default and the benchmark can adjudicate it [direct-read: benchmark results]. But there's a coordination problem layered underneath: the FlowKit team announced their recommendation in a public channel without coordinating with the JobRunner team [direct-read: Slack thread where the recommendation landed]. One of the FlowKit team members acknowledged later in that same thread that "we should probably loop the JobRunner folks in" — which means even they know the announcement got ahead of itself. The user's meeting can decide architecture. It cannot decide whether the teams talked.

## Phase 3: Cross-examination

Abridged. Key moves:

- distinguished-engineer challenges system-designer: "You're inferring that integrators pick whichever path they hit first. What's the evidence?" system-designer concedes the inference and tags it `[inferred]`, points at one anecdote from a recent onboarding survey but acknowledges it's weak.
- skeptic (when filled in) would pressure-test the political-realist's reading of the Slack thread: do those messages actually show what the political-realist claims they show?
- The user interrupts to say the political-realist is right but the framing is too combative for the meeting. They want the architectural debate framed as such, not as a coordination grievance.
- political-realist updates: surface the distinction in synthesis, but keep the meeting agenda technical.

## Phase 4: Synthesis

**Contested:**

- Whether FlowKit should be the default integration path. distinguished-engineer says no based on the benchmark. system-designer says no based on the visibility/ownership argument. political-realist says architecturally undecided but coordination is the bigger blocker. Resolution requires either a follow-up benchmark at parity or an explicit coordination conversation between the teams.
  - Would change distinguished-engineer's mind: a follow-up benchmark at equivalent or better latency than direct integration.
  - Would change FlowKit team's mind (inferred from their docs): direct integration becoming materially harder or more error-prone for new developers.

- Whether the meeting's primary venue should be technical decision-making or coordination repair. All three personas agreed coordination is the heavier issue but the user is not aiming to litigate it in this meeting.

**Agreed:**

- The benchmark is real and applies to the production critical path.
- FlowKit as a value-add (ergonomics for less-experienced teams, convenience workflow primitives) is uncontested.
- The two questions (default integration path, coordination process) need to be separated.

**Unknown:**

- Whether the FlowKit team's reasoning for positioning their wrapper as default is justified by anything other than ergonomics. Several reasons claimed in their announcement weren't tested in this council. This is a follow-up question, not a meeting blocker.

## Phase 5: Output — meeting agenda

The user requests an agenda format. The skill switches to async-response mode. Voice rules from `references/async-response.md` apply.

The skill produces a meeting agenda with two decoupled questions, three benchmark scenarios as eval variants, two-sided failure conditions for each, and a clear separation between the architectural decision and any coordination follow-up. The pre-send audit catches and rewrites several LLM-tell phrases before delivery.

The user reads, edits one paragraph, ships.

## Lessons (recorded in transcript)

- Phase 0 read of the actual Slack thread (not just a summary) was the highest-leverage step. Without it the political-realist's framing would have been speculative.
- The skeptic persona's absence was felt in cross-examination; political-realist had to do double duty pressure-testing claims.
- The async-response audit caught real LLM-tells. The pre-send checklist works.
- The architecture-vs-coordination distinction was the most useful single move. Worth keeping structural.

## Linked references

- `[[failure-modes]]` — the catalog of failures this run avoided.
- `[[discussion-patterns]]` — the rules in play.
- `[[async-response]]` — voice mode for the agenda output.
