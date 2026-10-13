# Escalation

When a council persona needs to do real investigation rather than continue inferring, the persona escalates to a subagent. The subagent returns a written report that re-enters the council as a new artifact under `[direct-read]` provenance.

## When to escalate

The originating persona should propose escalation when any of these is true:

- A claim requires reading more than two artifacts to verify.
- The disagreement between personas is empirical (a fact about a system) rather than a judgment call.
- The persona has hit the stop condition in `references/epistemic-discipline.md` (three or more inferences in a row).
- The user explicitly asks for a deeper read on a single dimension ("send the security reviewer to look at the threat model").

The persona names the question to investigate, the artifacts that need reading, and the kind of answer that would resolve the question. The user approves or redirects.

## How escalation works

1. The persona writes an investigation brief: question, artifacts, success criteria.
2. Spawn a subagent (`Agent` tool, `subagent_type: general-purpose` by default; `Explore` for read-only research).
3. The subagent runs the investigation independently. It does not see the council discussion; it sees only the brief.
4. The subagent returns a report with the answer and a provenance log of every source it read.
5. The report re-enters the council session as a new artifact tagged `[direct-read: subagent report <date>]`.
6. The originating persona reads the report and updates its position. Other personas can now reference the report's findings.

## Constraints on the escalated subagent

The subagent is bound by the same rules as the council. From its brief:

- Provenance discipline: every claim in the report carries a tag.
- "I don't know" is a valid answer. If the artifacts don't resolve the question, the report says so.
- Empty findings are findings. Don't pad the report.
- No persona voice. The subagent reports flatly; voice is the council's job, not the investigator's.

## Subagent type selection

- **Read-only investigation** (does this file say X? what does this thread show?): `Explore`. Faster, cheaper, can't accidentally edit.
- **Synthesis across many artifacts** (build a timeline, compare three docs): `general-purpose` with `model: opus`.
- **Codebase-specific investigation** (how does this function actually work, where is X called): a code-search-capable subagent if available, otherwise `general-purpose`.

## Return as artifact

The report file lives in the session's transcript directory (`transcripts/<date>-<topic>/escalations/<persona>-<question-slug>.md`). The council references it by path, not by quoting. This keeps the council's working context small while preserving the full investigation for the user to audit.

## Linked references

- `[[epistemic-discipline]]` — stop conditions that trigger escalation.
- `[[transcript-format]]` — where escalation reports live.
