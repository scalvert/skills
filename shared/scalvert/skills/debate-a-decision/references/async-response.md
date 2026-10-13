# Async response — voice rules for user-facing prose

When the user signals they want output (a Slack reply, an email, a doc comment, a meeting agenda, a PR body), the council switches modes. The persona discussion stops being shown. The skill produces an artifact in the user's voice for an audience of other humans.

This is a distinct mode from the internal council voice. The internal voice can be technical and persona-flavored; the external voice is the user's.

## Hard rules — strip every time

These apply to every external draft. Audit the draft against this list before delivery. Rewrite anything that matches.

### Phrases never to use

- "What I'd take as not in dispute"
- "Three places I'd want our collective view"
- "Useful inputs" / "useful framing"
- "Edits welcome before the meeting" / "Open to revisions in the room"
- "Going into tomorrow" / "ahead of tomorrow"
- "Worth flagging" / "worth noting" / "worth X-ing"
- "Lower the temperature"
- "Looking forward to digging in" / "happy to discuss"
- "I'd find it useful to..."
- "From my side"
- "Doing a lot of work" (as in "this point is doing a lot of work")
- "Push back on any of it"
- "Open question" (as filler)
- "Honest pushback"
- "Concretely" / "specifically" as transition openers

### Structural tics to break

- Reflexive triadic structures ("three things," "three places") when two or four would be more natural.
- Bullet/numbered lists when prose carries the meaning faster.
- Em-dash–heavy sentences. Avoid em dashes if the user's voice memory or stated preference says so.
- Hedging modal stacks ("I'd want," "I'd take," "I'd find it useful").
- "X / Y / Z" hedge triplets in noun phrases.
- Faux-judicial framing ("not in dispute," "places I'd want," "worth landing on").
- Corporate-collaborative pleasantries ("useful framing," "thanks for laying these out").
- Triadic categorization that flattens nuance ("technically valid / conflating / begging-the-question").

## Voice match

Match the user's actual register, sourced from their writing in past artifacts and any voice memory available:

- Contractions where the user uses them.
- Sentence rhythm matching the user's prior writing. Default to direct sentences with minimal subordination if no signal exists.
- Minimal hedging. Match how decisive the user is in their own writing.
- Match the user's capitalization conventions. If the user has stated a preference (e.g., no all-lowercase), follow it.

If the skill has access to a voice memory or past drafts, read them at session start to update this picture for the current session.

## Pre-send audit checklist

Run every external draft through this before delivering it back to the user. If any answer is "yes" except the last, rewrite.

1. Are there any phrases from the "never use" list above? (yes = rewrite)
2. Are there em dashes? (yes = rewrite)
3. Are there triadic structures that aren't naturally three? (yes = rewrite)
4. Does the first sentence sound like the user or like a template? Read it aloud.
5. Are there bullet points where prose would be faster? (yes = rewrite)
6. Are there hedging modal stacks? (yes = rewrite)
7. Is there anything internal-confidential being sent to a public-repo or external context? (yes = strip per the Public-repo confidentiality section below)

## Public-repo confidentiality

When the output is going to a public repo (PR body, public issue, public README, public comment), apply a confidentiality scan. Strip the following before delivery:

- Strip customer names, even widely-known ones.
- Strip internal ticket IDs (Jira, Linear).
- Strip internal codebase short names (e.g., monorepo nicknames).
- Strip internal URLs and `go/` links.
- Strip internal channel names.
- Strip employee names not already public on the repo.
- Strip security-incident specifics.

Default to public if the repo's visibility hasn't been verified.

## Output handoff

The skill produces the artifact, runs the audit, and shows the user the final draft. The user reads, edits, and ships. The skill does not commit, push, or send anything without explicit instruction.

## Linked references

- `[[discussion-patterns]]` — the council voice this mode departs from.
