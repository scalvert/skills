### Write the report

Use this shape, and nothing longer than the content needs:

```markdown
**Verdict:** Needs changes: 1 blocker, 2 should fix. <One sentence that says why.>

**Blockers**

**1.** `path/file.ts:42` <title>. <scenario in one or two sentences>. <evidence: the call path or repro>. Also at `path/other.ts:7`. (Found by 3 reviewers on 2 model families.)

**Should fix**

**2.** ...

**Pre-existing** (not from this change)

**3.** ...

**Smaller items** (at most 5; drop the rest)

**4.** ...

**Checked:** <depth> review: <lenses run>, on <model families>, at <short head SHA>. <What you ran, such as tests or a repro, or "Read only.">
**Not checked:** <anything a reader might assume you covered but you did not>.
```

Rules for the prose:

- Lead with the verdict that `verdict` gives. It counts findings from earlier rounds that are still open (`earlierOpen`), as well as new ones. Pre-existing and smaller items never hold a PR back.
  - `needs-changes`: `**Verdict:** Needs changes: <blockers> blocker, <should fix> should fix.`, with `counts` and `earlierOpen` added together, then one sentence that says why.
  - `ready` with findings: `**Verdict:** Ready to merge.`, then the counts of what is left, such as `1 pre-existing item, 2 smaller items.`
  - `ready` with no findings: `**Verdict:** Ready to merge. Nothing to fix.` Leave out the finding sections.
  - `needs-a-person`: `**Verdict:** Needs a decision from a person.`, then one line for each item in `waiting`: what is disputed or changed, and what the person must decide. Then the findings as usual.
- Put each finding in the section the report output gives it. Leave out a section that has no findings. A finding in `unrated` has no severity: record one and run the report again.
- For each item in `rejected`, add one line after the verdict: what was rejected, by whom, and their reason.
- A finding with a `repeatOf` may not be new. End its entry with one line: `This may repeat finding <n>, <its title>, which was <closed as intended | still open>.` An earlier finding from before the harness has no number: give its title only. A person decides whether it is the same problem. A finding with `recurs` ends with: `This came back after an earlier fix.`
- Start each finding with its number `n` from the report output, in bold, as its own paragraph: `**2.**`. Do not use a Markdown numbered list. It renumbers from its first item, and the numbers shown must be the review's. The harness gives the numbers in report order, and they continue across rounds, so a follow-up's first new finding may be 4. Leave any gap as it is.
- The user names a finding by its number ("fix 2"), and commands take the same number (`--finding 2`). No other ID exists for you to show.
- One finding per item. Give file and line, the scenario, and the evidence. List every other place from `instances` on the same item. Leave out praise and summaries of the diff.
- Mark a finding whose origin is `missed` with "missed in an earlier round". Mark a finding with a non-empty `recurs` with "came back after an earlier fix".
- Put code in backticks: identifiers, calls, paths, `file:line`, commands, flags and values.
- Plain words, short sentences, active voice. No em dashes, no emoji, no "it's worth noting".
- Cite the `REVIEW.md` rule or axiom ID when a finding rests on one.
- Leave out the dropped findings. They stay in the review's history.

Save the report and draft comments to a file and run `node <skill>/scripts/agent-review.mjs prose --github <file>`. Fix each flag, or keep it on purpose (for example, a quoted error message), before you show the report. A finding number is a flag to fix only in the draft comments. The report is for this conversation, and keeps its numbers.

