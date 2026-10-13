# Discussion Round Protocol

The cross-panel discussion is the most valuable part of the evaluation panel. It surfaces blind spots that no individual agent catches, resolves conflicting assessments, and produces the cross-confirmation signal used to classify findings as high-confidence.

---

## When to Run the Discussion

Run the discussion round once **all** agents have submitted their initial assessments. Do not broadcast cross-panel findings until every agent has reported — premature broadcasting anchors later agents to earlier findings, defeating the purpose of blind parallel assessment.

If a panelist returns no findings or fails, accept that as silence and note in the synthesis that it produced no findings.

---

## Discussion Prompt Template

Start one fresh subagent per panelist for the discussion round. Give each one its own round-one report first, then this prompt:

```
All N agents have submitted their assessments. Review findings from OTHER agents and respond with:

1. **Agreements** — findings from other agents that corroborate or strengthen your own assessment
2. **Disputes** — findings you believe are incorrect, overstated, or understated. Provide evidence for your position.
3. **Revised score** — does anything from the cross-panel change your rating? State the new score and why.
4. **Blind spots** — important issues that no agent flagged yet. These are your most valuable contribution to this round.

---

## CROSS-PANEL FINDINGS SUMMARY

### [Agent Name] (X/10)
[Paste each agent's key findings, rating, and top recommendations]

---

## KEY CONVERGENCE POINTS (confirmed by 2+ agents)
1. [Finding A] — confirmed by [agent1], [agent2]
2. [Finding B] — confirmed by [agent1], [agent3]
...

## KEY TENSIONS TO RESOLVE
- [Agent X] rated 8/10 while [Agent Y] rated 5/10 — are these compatible? What's the right synthesis?
- [Agent A] says X is fine; [Agent B] says X is a critical bug — who is right and why?
...

---

Return your discussion contribution as your final answer.
Keep it focused: agreements, disputes, revised score (if any), and blind spots.
```

---

## Handling Discussion Responses

### Agreements
Track which findings get corroborated. Any finding confirmed by 3+ agents in the discussion round should be flagged as **High Confidence** and given elevated severity in the final report.

### Disputes
When two agents disagree, evaluate based on:
- Which agent has the more domain-relevant specialization?
- Which agent cited specific file:line evidence vs. general assessment?
- Did the disputed finding have a low confidence rating from the original reporter?

Disputed findings with no resolution: include in the report with a "Disputed" tag rather than omitting.

### Score Revisions
Track:
- Initial score per agent
- Post-discussion score per agent
- Direction of revision (up/down/unchanged)

Panels where all revisions go downward signal that the subject has more problems than it appeared. This is itself a finding worth including in the executive summary.

### Blind Spots
Blind spots from the discussion round often have the highest information density — they represent gaps that 10 independent specialists all missed, then one surfaced when seeing the cross-panel view. These frequently become the most actionable recommendations.

---

## How Many Discussion Rounds?

**One round is almost always enough.** The diminishing returns are steep:
- Round 1: Surfaces 5-10 new findings, resolves most conflicts
- Round 2: Surfaces 0-2 new findings at significant token cost

Run a second round only if:
- A major unresolved conflict exists between two high-confidence agents
- Multiple agents flagged a significant blind spot that warrants dedicated investigation
- The first round produced substantially different scores (>3 points) between agents that should theoretically agree

---

## Handling Panelists With Nothing to Add

Some discussion subagents return nothing new. That is normal. Proceed with the responses you have, and do not rerun them.

---

## Synthesis Rules After Discussion

### Confidence Classification

Use cross-agent confirmation as the primary confidence signal:

| Confirmation Level | Classification | Action |
|---|---|---|
| 3+ agents independently | **Confirmed** | Always include; elevate severity if needed |
| 2 agents | **Corroborated** | Include with stated confidence |
| 1 agent, High confidence | **Single-agent high** | Include with note |
| 1 agent, Medium confidence | **Single-agent medium** | Include for High/Critical; footnote for Medium/Low |
| 1 agent, Low confidence | **Speculative** | Footnote only, or omit |

### Score Aggregation

Don't average all scores. Weight by use-case relevance:
- If evaluating for remote server suitability, the `remote-suitability` agent's score matters more than the `dx-analyst`'s score for that dimension
- Use the weighted score in the "Verdict by use case" table rather than a flat average
- Report individual scores alongside the weighted composite

### Issue Table Format

The final issue summary table should include:
```
| # | Issue | Severity | File(s) | Confirmed By (N agents) |
```

This gives readers an at-a-glance view of which findings are most trustworthy.

---

## Ending the Panel

Subagents end when they return. Nothing needs to be shut down.
