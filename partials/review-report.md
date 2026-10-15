### Write the report

Use this shape, and nothing longer than the content needs:

```markdown
**Verdict:** <Ready to merge | Needs changes | Blocked>, in one sentence that says why.

**Blockers**
1. `path/file.ts:42` <title>. <scenario in one or two sentences>. <evidence: the call path or repro>. (Found by 3 reviewers on 2 model families.)

**Should fix**
2. ...

**Smaller items** (at most 5; drop the rest)
- ...

**Checked:** <lenses run>, on <model families>, at <short head SHA>. <What you ran, such as tests or a repro, or "Read only.">
**Not checked:** <anything a reader might assume you covered but you did not>.
```

Rules for the prose:

- Lead with the verdict.
- Number the findings 1, 2, 3 in report order, across sections, using `n` from the report output. Never show ledger IDs (F1, F2): they mean nothing to anyone else. Keep the map from number to ledger ID for later commands in this conversation, so the user can say "fix 2".
- One finding per item. Give file and line, the scenario, and the evidence. Leave out praise and summaries of the diff.
- Put code in backticks: identifiers, calls, paths, `file:line`, commands, flags and values.
- Plain words, short sentences, active voice. No em dashes, no emoji, no "it's worth noting".
- Cite the `REVIEW.md` rule or axiom ID when a finding rests on one.
- Leave out the dropped findings. They stay in the ledger.

Save the report and draft comments to a file and run `node <skill>/scripts/agent-review.mjs prose --github <file>`. Fix each flag, or keep it on purpose (for example, a quoted error message), before you show the report.
