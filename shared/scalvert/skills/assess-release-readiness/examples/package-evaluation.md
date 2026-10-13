> **Domain:** Software package / library evaluation
> For other software artifact types, see `references/agent-specializations.md`.

# Example: npm Package Production Readiness Evaluation

This example shows the complete 10-agent panel used to assess a third-party npm package for production use against a remote service. Use as a template for evaluating other npm packages or libraries.

---

## Pre-Research Phase

```bash
# Collect baseline context before spawning agents
npm show @package/name --json  # Version, dependencies, scripts, maintainers
```

Also fetch:
- README from GitHub (WebFetch or local file)
- Source directory listing (to understand what agents should read)
- Any explicit stability/experimental markers

**Pre-research goal**: Give every agent enough shared context that they can specialize immediately rather than spending their first turns on discovery.

---

## Panel

Ten panelists, each a subagent with a fresh context, spread across two model families (for example six on the host model and four on another provider).

---

## Agent Panel (10 Agents)

Start all panelists at once, in parallel.

### Agent 1: `production-readiness`
**Focus**: Versioning, stability signals, maintenance health, breaking change risk, dependency conflicts

Key questions to embed in prompt:
- What does the version number tell us? Pre-1.0? Breaking change rate?
- Are dependencies correctly specified (peer vs. optional vs. required)?
- Is there a CHANGELOG? Is it maintained?
- What's the bus factor?
- Is the published npm version in sync with the repository?

### Agent 2: `implementation-correctness`
**Focus**: Core logic bugs, edge cases, async correctness, resource cleanup

Key questions:
- Does the fundamental logic work for the primary happy path?
- What happens with empty inputs, null values, timeouts?
- Are promises and async operations properly awaited?
- Is state properly cleaned up?

### Agent 3: `eval-correctness`
**Focus**: If the package includes eval/testing features — methodology, statistical validity, judge design

Key questions:
- Is the LLM-as-judge prompt well-designed? What biases exist?
- Are results statistically meaningful? Are there confidence intervals?
- Is multi-run aggregation handled correctly?
- What can corrupt results silently?

### Agent 4: `protocol-compliance`
**Focus**: Adherence to the protocol/spec the package claims to implement

Key questions:
- Does it correctly implement the wire protocol?
- Are all required fields/operations correctly handled?
- What's explicitly out of scope, and does that matter for the use case?

### Agent 5: `eval-framework-patterns`
**Focus**: Comparison to established eval framework conventions (HELM, Braintrust, Promptfoo, etc.)

Key questions:
- What standard features are missing?
- Where does it innovate beyond the norm?
- What would a practitioner from an established framework miss?

### Agent 6: `remote-suitability`
**Focus**: Network resilience, auth in CI/CD, rate limiting, connection management

**This is the most use-case-specific agent** — tailor its questions to the specific deployment scenario.

Key questions:
- Is there retry logic for transient failures?
- How does OAuth/auth work in headless CI?
- What happens with 429, 503, connection resets?
- Are there TLS configuration options?
- Can tests run in parallel without overwhelming the remote server?

### Agent 7: `alternatives-researcher`
**Focus**: What else exists, feature comparison, build-vs-buy analysis

Key questions:
- What are the 3-5 most viable alternatives?
- What does this package offer that no alternative does?
- What's the rough effort to build a "good enough" custom harness?
- When should you use each alternative?

### Agent 8: `security-analyst`
**Focus**: Auth implementation, credential handling, CVEs, data exposure

Key questions:
- Are OAuth flows correctly implemented (PKCE, state, CSRF)?
- Are tokens stored with appropriate permissions?
- Are there active CVEs in direct dependencies?
- Is sensitive data (tokens, API keys) protected from logging?

### Agent 9: `dx-analyst`
**Focus**: API ergonomics, TypeScript quality, documentation accuracy, onboarding experience

Key questions:
- How many lines to write the first working test?
- Do the TypeScript types match what the runtime does?
- Are examples in the docs correct and runnable?
- What's confusing vs. what's delightful?

### Agent 10: `test-infrastructure-analyst`
**Focus**: Coverage of the package's own tests, critical untested paths, dogfooding

Key questions:
- What percentage of source files have tests?
- What are the most critical paths with no test coverage?
- Does the project test itself using its own APIs?
- Is CI adequate? Does it catch regressions?

---

## Discussion Round

After all 10 panelists report, start one fresh subagent per panelist with its own report and this prompt:

```
All 10 agents have submitted. Review cross-panel findings and respond with:
1. Agreements — what corroborates your assessment
2. Disputes — what you believe is incorrect
3. Revised score — if anything changed your view
4. Blind spots — important issues nobody flagged

[PASTE ALL 10 AGENT REPORTS HERE]

KEY CONVERGENCES (confirmed by 2+ agents):
[List]

KEY TENSIONS:
[List conflicting scores and interpretations]
```

---

## What to Watch For in Discussion

**Universal downward revision**: If all agents revise down, the package has more problems than first appeared.

**Cross-domain blind spots**: Security analysts miss eval correctness issues. Eval analysts miss proxy support gaps. The most valuable discussion contributions come from agents applying their lens to another agent's findings.

**Dispute patterns**: When `protocol-compliance` rates 8/10 but `remote-suitability` rates 5/10, they're not contradicting — they measure orthogonal things. Present both scores; don't average.

---

## Output File

Write results to `eval-[package-name]-results.md`. Include:
- Executive summary with use-case-specific verdicts
- Panel scores table with initial/final/delta
- Issues by severity (P0/P1/P2) with file:line
- Alternatives comparison table
- Prioritized remediation plan (P0/P1/P2)

---

## Lessons Learned from This Pattern

1. **Pre-research is not optional**: Agents that start without context spend 30-40% of their turns on discovery. 4 targeted fetches before spawning saves significant time.

2. **Structured output templates dramatically reduce synthesis time**: Free-form prose assessments require the lead to re-read everything. A table with `Severity | Finding | File:Line | Confidence` can be scanned in seconds.

3. **The discussion round reliably surfaces 3-5 findings no individual agent caught**: Cross-domain blind spots are real. Security analysts don't think about eval result contamination from CVEs. Eval analysts don't think about proxy support. The cross-pollination phase consistently produces findings that would otherwise be missed.

4. **All score revisions went downward in the observed panel**: This was a consistent signal — seeing the full cross-panel picture made every agent more critical, not less. This is healthy: it means the panel is calibrated and not just validating each other's initial optimism.

5. **File:line references are the difference between actionable and vague**: "The auth module seems insecure" is useless. "The `PlaywrightOAuthClientProvider.saveState()` at `oauthClientProvider.ts:280` writes tokens without `0o600` permissions, inconsistent with `FileOAuthStorage` at `storage.ts:455`" is directly actionable.
