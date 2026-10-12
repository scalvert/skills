# Failure modes

The specific patterns this skill exists to prevent. Each entry is a test case: if the skill produces this pattern in a real run, the skill is failing.

This file is read by the council at session start so the personas remember what they're guarding against. New failures discovered in real sessions get added here from transcript `Lessons` sections.

## 1. Strawman of the user's position

**Pattern:** The council attacks a position the user did not hold. The position they actually held was stated in an artifact — a doc, a Slack thread, a code comment — that the council failed to read before challenging.

**Test:** A persona challenges the user's position without first quoting it from a `[direct-read]` source.

**Pass:** Phase 1 confirmation gate runs. Personas quote the position before challenging. The user confirms or corrects before any persona pushes back.

**Linked rule:** `references/discussion-patterns.md` — anti-strawman guard.

## 2. Silent edit of the user's framing

**Pattern:** The skill modifies a list, framing, or set of options the user provided, dropping or rewriting items without surfacing the change. The user catches it on review and is rightly annoyed.

**Test:** The skill modifies a list, framing, or structure provided by the user without flagging the change in plain language.

**Pass:** Modifications to user-supplied content are flagged explicitly. The user approves before the change persists.

**Linked rule:** `references/discussion-patterns.md` — no silent edits.

## 3. Three confident-but-wrong claims in sequence

**Pattern:** A persona makes a chain of architectural assertions, each presented as fact, each corrected by the user from direct operational knowledge. The persona doesn't catch the pattern; it keeps inferring confidently into territory the user knows better than the council does.

**Test:** A persona makes three or more inferences in a row without provenance tags, presented assertively, on a topic where the user has direct operational knowledge.

**Pass:** Provenance tags on every claim. The stop condition triggers after three inferences. The defer-to-direct-experience rule applies as soon as the user corrects.

**Linked rule:** `references/epistemic-discipline.md` — provenance levels, stop conditions, defer to direct experience.

## 4. Conflation of distinct concepts as one

**Pattern:** A short noun is used across multiple distinct meanings in the same paragraph (e.g., a paradigm, a file format, and a delivery mechanism all called by the same name). Each meaning is a separate decision; treating them as one produces incoherent analysis.

**Test:** The skill reasons across a term that has multiple distinct meanings without disambiguating in the glossary first.

**Pass:** Glossary opens in Phase 0.5. Ambiguous terms get split before personas reason across them. Two distinct names beat one ambiguous name.

**Linked rule:** `references/epistemic-discipline.md` — conflation checks. `references/discussion-patterns.md` — anti-conflation glossary.

## 5. LLM-tell phrasing in user-facing prose

**Pattern:** A draft produced for external delivery contains phrasings that are classically LLM-generated and inauthentic to the user's voice. Generic hedging, faux-judicial framing ("what I'd take as not in dispute"), reflexive triadic structures ("three places," "three things"), corporate-collaborative pleasantries ("worth flagging," "looking forward to digging in"). The result feels performative — like the assistant didn't put actual thought into it.

**Test:** A draft produced for external use contains any phrase from the never-use list, or any structural tic from the break list.

**Pass:** Pre-send audit per `references/async-response.md` runs on every external draft. Matches against the never-use list trigger rewrites before delivery.

**Linked rule:** `references/async-response.md`.

## 6. Architecture-vs-coordination conflation

**Pattern:** A debate between teams that have shipped overlapping work gets treated entirely as a technical decision. The architectural debate is real but partial; the heavier issue is that the teams haven't coordinated, and that goes unnamed. More analysis won't fix it.

**Test:** A debate between teams with overlapping work gets analyzed only as technical, with no explicit naming of the coordination layer.

**Pass:** When org signals appear in artifacts (one team shipping without consulting another, decisions made retroactively to justify already-shipped work, public-channel announcements that bypass affected stakeholders), the political-realist persona enters the discussion and names the distinction explicitly.

**Linked rule:** `references/discussion-patterns.md` — architecture vs. coordination. `references/personas.md` — political-realist.

## 7. Capability claim conflated with result claim

**Pattern:** The skill describes what data it could pull from a tool ("we could find strong-fit and weak-fit categories here") without actually running the queries. The capability statement gets framed as if it were query results.

**Test:** The skill says what data exists or what a search would find without having run the search.

**Pass:** Capability statements are tagged `[assumed]` or framed as "these tools are for X." Result statements require an actually-executed query and a `[direct-read]` tag with the source.

**Linked rule:** `references/epistemic-discipline.md` — provenance levels.

## How to use this file

At session start, Phase 0 should briefly check this list. The personas don't need to recite it; they need to recognize the patterns. When a real session produces a new failure mode, add it here with the same structure (pattern / test / pass / linked rule).

Over time, this file becomes the skill's regression test suite. Not automated, but the canonical "things this skill must not do."
