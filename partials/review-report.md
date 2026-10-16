### Write the report

Use this shape, and nothing longer than the content needs:

```markdown
**Verdict:** <Ready to merge | Needs changes | Blocked>, in one sentence that says why.

**Blockers**
- **F1** `path/file.ts:42` <title>. <scenario in one or two sentences>. <evidence: the call path or repro>. (Found by 3 reviewers on 2 model families.)

**Should fix**
- **F4** ...

**Smaller items** (at most 5; drop the rest)
- ...

**Checked:** <lenses run>, on <model families>, at <short head SHA>. <What you ran, such as tests or a repro, or "Read only.">
**Not checked:** <anything a reader might assume you covered but you did not>.
```

Rules for the prose:

- Lead with the verdict. Label each finding with its ledger ID (F1, F2, ...), so the author can answer "F1 is fixed" and later rounds keep the same labels.
- One finding per item. Give file and line, the scenario, and the evidence. Leave out praise and summaries of the diff.
- Plain words, short sentences, active voice. No em dashes, no emoji, no "it's worth noting".
- Cite the `REVIEW.md` rule or axiom ID when a finding rests on one.
- Leave out the dropped findings. They stay in the ledger.

Save the report and draft comments to a file and run `node <skill>/scripts/agent-review.mjs prose <file>`. Fix each flag, or keep it on purpose (for example, a quoted error message), before you show the report.
