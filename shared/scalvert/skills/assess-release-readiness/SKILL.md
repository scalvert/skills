---
name: assess-release-readiness
description: Assess whether a release, milestone, merge or package is ready, using a panel of specialist agents that review the same subject independently, cross-check each other, and agree on one prioritized report. Use when asked if something is ready to ship, release or merge, for an audit or deep-dive (security, docs, architecture, packaging), for an assessment from several independent perspectives, or to run the agent council. For quick pushback on a decision or draft, use debate-a-decision.
version: 0.5.0
---

# Assess release readiness

Formerly `agent-council`.

A structured protocol for deep assessments that require multiple expert perspectives, cross-validation of findings, and a collective discussion phase before results are presented.

This differs from basic parallel dispatch (which splits independent work). Here, agents all assess the *same* subject from different angles, then actively discuss each other's findings to surface blind spots, resolve conflicts, and converge on a consensus.

---

## Evaluation Purposes

The framing of the entire evaluation — agent lenses, severity language, report structure — depends on what the user is trying to learn. These are distinct purposes with different questions:

| Purpose | Core question | Severity language | Typical lenses |
|---|---|---|---|
| **Pre-release gate** | Is this ready to ship? | Blocker / should-fix / nice-to-have | Correctness, test coverage, docs completeness |
| **Architectural review** | Is the design sound? | Structural risk / evolution friction / acceptable tradeoff | Architecture, API ergonomics, coupling, extensibility |
| **Post-release audit** | What should we improve? | High user impact / low effort / backlog | Usability, performance, error experience |
| **Security review** | What are the attack surfaces? | Critical / high / informational | Auth, input validation, dependency risk, secrets |
| **Documentation audit** | Is the docs accurate and complete? | Blocking gap / stale / missing | Accuracy, completeness, user journey |

**If the user does not specify the evaluation purpose, ask before proceeding.** Spinning up 6 agents in the wrong direction produces findings that don't answer the user's actual question. A one-question pause is always worth it.

Ask: *"What's the goal of this evaluation — pre-release readiness, architectural review, a post-release audit, or something else? That determines which lenses and severity framing to use."*

Once the purpose is established, carry it through every subsequent phase: agent specializations, the context block given to agents, severity labels in findings tables, and the executive summary framing.

---

## The Two Run Modes

**First run (Discovery):** No prior checklist exists. Agents discover issues across the full surface. Phase 5 produces both a narrative report and a canonical `EVAL-CHECKLIST.md` artifact. This becomes the persistent source of truth.

**Subsequent runs (Verification):** A checklist already exists. Agents shift from discovery to *verifying closure* of known items. New findings are still surfaced but are additive — they get appended to the checklist, not lost in a new report. Phase 5 produces a closure report and an updated checklist.

The biggest failure mode of repeated reviews is re-discovering things that were already found. The checklist prevents this.

---

## Phase 0 — Establish Purpose and Check for Existing Checklist

**Before anything else:**

1. **Determine the evaluation purpose.** If the user specified it (e.g., "architectural review", "security audit"), record it. If not, ask — see the Evaluation Purposes table above.

2. **Look for an `EVAL-CHECKLIST.md`** in the project root or a conventional location (`.claude/`, `docs/`, root).
   - **If found**: You are in **Verification Mode**. Read the checklist. Note which items are OPEN vs CLOSED. Tell the user: "Found existing checklist with N open items. Running in verification mode."
     - Run `git log --oneline -10` to find recent commits. Cross-reference with items marked CLOSED — if a "closed by PR #N" item doesn't appear in git log, the fix may have landed on a different branch. Flag this explicitly.
   - **If not found**: You are in **Discovery Mode**. Proceed with the full discovery protocol.

---

## Phase 1 — Pre-Research (Lead Agent)

Gather baseline context to orient all agents. Keep this to 2-4 targeted fetches — agents will do the deep reading.

### Search Hygiene — MANDATORY

All glob and grep operations during pre-research MUST exclude generated, vendored, and dependency directories. Failure to do this causes truncated results that produce false "X doesn't exist" conclusions, which then contaminate every agent's context simultaneously.

**Before searching:**
1. Check if a `.gitignore` (or equivalent ignore file) exists and read it
2. Exclude every ignored path from your searches — dependency directories, build output, caches
3. Scope glob patterns to source directories, not project root (which pulls in ignored paths)

**Never infer absence from a search result that may have been truncated.** If you need to know whether a specific file exists, check it directly:

```bash
# WRONG — broad glob may be truncated before reaching the file you're looking for
Glob(pattern: "**/*.md")   # returns thousands of matches from ignored directories first

# RIGHT — direct verification
Bash: ls /project/README* 2>/dev/null || echo "not found"
Read: /project/path/to/file.md   # a read error means it doesn't exist; success means it does
```

Pre-research findings are injected into every agent's context. A single false absence claim propagates as false belief to all N agents simultaneously — the cross-panel structure cannot correct it because all agents start with the same poisoned context. Only assert that something doesn't exist after a direct check confirms it.

### Domain Intent Gate

Before noting any behavior as problematic, ask: **is this behavior consistent with the stated purpose of this artifact?** Behavior that looks surprising or incorrect in a general context may be the explicit contract of a domain-specific tool. Always read the README, CLAUDE.md, or any stated design intent before framing behavior as a defect.

Document the artifact's domain and purpose explicitly in the pre-research summary so all agents can calibrate their findings against it — not against generic SWE intuitions.

Adapt pre-research to the artifact being evaluated:

**Codebase or feature branch**: Read README, CLAUDE.md, and architecture docs; map
the top-level directory; note tech stack, test runner, and CI configuration.

**Pull request**: Read the PR description and diff; note files changed,
test coverage delta, and any linked issues or context docs.

**API or interface design**: Read the API spec or interface definitions;
note surface area, versioning strategy, and consumer contracts.

**Architectural proposal (ADR/RFC)**: Read the full document; note stated
goals, constraints, open questions, and any prior decisions it supersedes.

**Library or package**: Fetch package metadata; read README and changelog;
note version, stability markers, dependencies, and repository health.

**Documentation audit**: List all doc files; scan for broken internal links
(`grep -r "\[.*\](.*\.md)" docs/` and verify targets exist); check for
phantom exports (functions or types shown as importable that are not in
`src/index.ts`); note the most recent breaking changes that would require
doc updates (renames, removals, restructures).

**In Verification Mode:** Also summarize the open checklist items for agents. Each agent's prompt should include the relevant checklist items they are responsible for verifying closure of, in addition to their normal discovery scope.

---

## Phase 2 — Panel

Each panelist is a subagent with a fresh context. This works the same way in every host, with no team or messaging tools:

- **Tau:** start the panelists as parallel subagent tasks.
- **Claude Code:** start them as parallel subagents.
- **Codex:** start them as parallel subagents.

Spread the panel across at least two model families. In Tau, set `model` (`provider/model-id`) on about half the tasks. In Claude Code, run two or more panelists on another family with `codex exec -s read-only`. In Codex, use `claude -p --permission-mode plan`. Give each panelist the same prompt, whatever its model. If only one family is available, say so in the report.

Choose panel size based on scope:
- **3-5 agents**: Focused single-domain audit (security review, API design review)
- **6-8 agents**: Multi-domain assessment (technical + process + risk)
- **8-12 agents**: Comprehensive deep-dive (all dimensions simultaneously)

In Verification Mode, you can often use fewer agents (3-5) because the scope is scoped to known open items rather than full discovery.

---

## Phase 3 — Parallel Blind Assessment

Dispatch all agents simultaneously. Agents must not see each other's findings during this phase — independence prevents anchoring bias.

**Agent prompt structure:**
1. **Context block** — shared pre-research findings
2. **Independent verification requirement** — agents MUST re-verify key structural claims from pre-research themselves before citing them as findings (see below)
3. **Domain intent reminder** — agents must ask "is this behavior consistent with this library/tool's purpose?" before flagging anything as a bug
4. **Specialization** — the exact dimension this agent assesses
5. **Scope** — what files/paths to examine
6. **In Verification Mode: Checklist items to verify** — list the specific open items this agent is responsible for confirming closed or still open, with their acceptance criteria
7. **Required output format** — enforce structured output

**Always include this block in every agent prompt:**
```
## Critical: Independently Verify Pre-Research Claims

The pre-research context above was gathered by the lead agent. Before citing any structural
fact as a finding, verify it yourself:

- If pre-research says a file does not exist: attempt to Read it directly. An error confirms
  absence. A successful read means pre-research was wrong — do NOT cite the absence as a finding.
- If pre-research says an API name or value: check the actual source file.
- Do NOT exclude node_modules/, dist/, or .git/ from your own searches — but DO exclude them
  when scoping your analysis to source files.

Pre-research errors propagate to every agent simultaneously. Your independent verification
is the only correction mechanism.

## Domain Intent Gate

Before flagging any behavior as a bug or design flaw, ask:
"Is this behavior consistent with the stated purpose of this artifact?"

A test harness that creates temp directories is not exhibiting a side effect — it is doing
its job. A retry mechanism that swallows errors may be intentional resilience design.
Check the README, CLAUDE.md, or description for stated intent before deciding behavior is wrong.

## Read budget

Prefer grep or rg with a line limit over reading whole files. Grep any file over about
1000 lines instead of reading it end to end. Use `git log --oneline` or `--stat`, never
`git log -p`. Pipe long command output through `head`.
```

**Required agent output format:**
```
### [Domain] Assessment
**Overall Rating:** X/10

**Checklist Item Status** (Verification Mode only):
| Item ID | Description | Status | Evidence |
|---------|-------------|--------|----------|
| CHK-001 | ... | CLOSED / STILL OPEN | file:line or "fix confirmed" |

**New Findings:**
| Severity | Finding | File:Line | Confidence |
|----------|---------|-----------|------------|
| Critical | ... | ... | High |

**Strengths:**
[What works well]

**Recommendations:**
[Prioritized fixes]
```

Start all panelists at once, in parallel.

### When a panelist fails

- **Out of context.** A panelist that runs out of context almost always made one oversized read. Broad lenses, such as a devil's advocate or an "audit everything" brief, are the most exposed. Narrow its scope and run it again. Don't retry it on a cheaper model first, because a smaller window makes the same failure more likely.
- **Rejected by the model service** (quota, or the model isn't available). Retry the same brief once on another available model. An errored panelist doesn't count as agreement.
- **Too few reports.** Don't start the discussion round until at least two panelists have returned assessments. If every retry fails, continue only if the user agrees, and say in the report that there is no cross-panel consensus.
- **High-stakes items.** Check the release-blocker candidates yourself while the panel runs. Don't find out at synthesis time that the only panelist covering a blocker never reported.

---

## Phase 4 — Cross-Panel Discussion Round

> **Anonymize before broadcasting.** When compiling findings for the cross-panel
> broadcast, replace each agent's identity with a neutral label ("Panel Member A",
> "Panel Member B", etc.). Do not reveal specialization names.
>
> Why: Broadcasting "security-analyst said X" causes other agents to anchor on
> the role label rather than evaluate the evidence. Anonymization forces agents
> to engage with the finding on its merits. Reveal identities only in the final report.

Once all agents have reported, run the discussion as a second round of subagents. Start one fresh subagent per panelist, on the same model as its first round. Give it its own round-one report and the anonymized findings of everyone else, using the template below. A subagent that has already returned cannot receive messages, so the second round must pass in the context that a broadcast would have carried.

**Discussion prompt:**
```
All N agents have submitted assessments. Review findings from OTHER agents and respond with:

1. **Agreements** — findings from other agents that corroborate yours
2. **Disputes** — findings you believe are incorrect or misstated
3. **Revised score** — does the cross-panel change your rating? Why?
4. **Blind spots** — important issues that no agent flagged yet
5. **[Verification Mode] Closure disputes** — checklist items where you disagree with another agent's CLOSED verdict

CROSS-PANEL FINDINGS SUMMARY:
[Paste all agent findings here]

KEY CONVERGENCES (issues flagged by 2+ agents):
[List multi-confirmed findings]

KEY TENSIONS TO RESOLVE:
[List conflicting scores or interpretations]
```

**The discussion phase serves three functions:**
1. **Cross-confirmation**: Issues flagged by 3+ agents independently become high-confidence findings
2. **Blind spot surfacing**: Agents notice gaps in other agents' coverage
3. **Score convergence/divergence**: Agents revise ratings after seeing the full picture — almost always downward, which is a healthy signal

---

## Phase 5 — Synthesis, Report, and Checklist

After the discussion round, compile the final report and update the checklist artifact.

**Confidence classification for new findings:**
- **Confirmed** (3+ independent agents): Always include; automatically elevated to at least High severity
- **Corroborated** (2 agents): Include with High or Critical severity
- **Single-agent** (1 agent, High confidence): Include with appropriate severity
- **Single-agent** (1 agent, Low confidence): Footnote only, or omit

**Report structure:**
1. Executive summary with readiness verdict
2. Panel scores table (initial + post-discussion, showing delta)
3. **[Verification Mode]** Closure summary: how many checklist items are now CLOSED vs still OPEN
4. Issues by severity (P0/P1/P2) with file:line references
5. Agent agreements and key tensions resolved
6. Prioritized remediation plan

**Produce or update the checklist artifact.** This is mandatory — it's what prevents the next panel from re-discovering what this one found.

### EVAL-CHECKLIST.md Format

```markdown
# Eval Checklist — [Subject]

Generated: [date] | Last updated: [date] | Current panel: [version/context]

## How to read this
- P0 = release blocker; P1 = should fix before release; P2 = nice to have
- Each item has a unique ID (CHK-NNN), acceptance criteria, and the agents who found it
- Items are OPEN until acceptance criteria are verifiably met

---

## P0 — Release Blockers

- [ ] **CHK-001** `toMatchToolSnapshot` requires Playwright context — no warning in docs or API
  - **File:** `src/assertions/matchers/toMatchToolSnapshot.ts:1`
  - **Acceptance:** JSDoc `@remarks` present AND warning callout in `docs/expectations.md` snapshot section
  - **Opened:** [panel version] | **Agents:** docs-completeness, test-confidence

## P1 — Should fix before release

- [ ] **CHK-002** `accuracy` deprecated alias still on `EvalCaseResult`
  - **File:** `src/types/reporter.ts:220`
  - **Acceptance:** Field removed from type definition and all references updated
  - **Opened:** [panel version] | **Agent:** api-stability

## P2 — Nice to have

(none)

---

## Closed

- [x] **CHK-003** `@ai-sdk/ollama` does not exist on npm
  - **File:** `src/evals/llmHost/llmHostTypes.ts:32`
  - **Closed by:** PR #85 | **Verified-at:** `abc1234` | **Verified:** [next panel version]
  - **How closed:** Removed from LLMProvider union, datasetTypes.ts, vercel.ts, docs
```

**Rules for maintaining the checklist:**
- Every finding that reaches the report gets a CHK-NNN ID. No exceptions.
- Acceptance criteria must be specific enough that a future agent can verify closure with a file read — not vague like "fix the bug."
- When an item is closed, move it to the Closed section with a note on how it was closed and which panel verified it.
- Items discovered for the first time in a Verification Mode panel are still added with new CHK IDs.

Subagents end when they return, so there is nothing to shut down.

---

## Designing the Agent Panel

### How Many Agents

Start with the question: *how many genuinely different lenses does this subject have?* Each agent should see something the others won't naturally notice.

**Software engineering evaluations** should map agents to senior SWE principle
categories. These lenses catch distinct failure modes:

- **code-structure-reviewer**: encapsulation, single responsibility, composition
  over inheritance, appropriate abstraction level
- **decoupling-reviewer**: dependency injection, hidden global state, side-effect
  isolation, testability without heavy setup
- **testing-reviewer**: behavior vs. implementation tests, happy path vs. edge case
  coverage, test code quality, documentation value of tests
- **naming-clarity-reviewer**: naming expressiveness, abbreviations, data structure
  clarity, readability for the next engineer
- **error-handling-reviewer**: fail-loudly discipline, silent swallowing, failure
  as first-class concept, boundary validation
- **maintainability-reviewer**: blast radius of change, explicit vs. implicit,
  scout rule adherence, cleverness debt
- **architecture-reviewer**: layer boundary discipline, domain/infrastructure
  separation, dependency directionality, replaceability

When an axioms file is present (`$AXIOMS_PATH`, else
`~/.config/scalvert/axioms.md`), use its principles as the code-structure lenses
in place of the list above. Give each code-structure panelist a few axioms
(for example A1 to A3). Each finding must cite the axiom ID and quote the
principle. The axioms are the reviewer's own beliefs about good code, so they
outrank the generic lenses wherever the two disagree.

Not every evaluation needs all seven. Pick the lenses most relevant to the
artifact being reviewed. Add domain-specific lenses on top (e.g., security,
performance, protocol compliance) as needed. See `references/agent-specializations.md`
for full templates by artifact type.

For `N` agents, aim for `N` genuinely distinct specializations — not N variations of "code quality."

### Including a Devil's Advocate

For highly consequential evaluations, include one agent explicitly tasked with arguing for the opposite conclusion. If the default expectation is "this is probably fine," the devil's advocate argues "why this is actually broken." This prevents groupthink and surfaces uncomfortable findings that polite agents won't raise.

---

## Key Improvements Over Basic Parallel Dispatch

**Persistent checklist artifact**: Every finding gets a unique ID, acceptance criteria, and lives in `EVAL-CHECKLIST.md`. Subsequent panels verify closure rather than re-discover — this is the single biggest quality improvement over episodic reviews.

**Two modes (Discovery vs Verification)**: The first panel runs full discovery. Subsequent panels focus on verifying closure of known items and surfacing genuinely new findings. This prevents the common failure where each review round rediscovers what previous rounds already found.

**Structured output formats**: Requiring `Severity | Finding | File:Line | Confidence` tables makes synthesis fast and reduces vague findings.

**Cross-confirmation auto-elevation**: Any finding confirmed by 3+ agents independently is automatically elevated. Corroboration threshold is more reliable than individual agent judgment.

**Score delta tracking**: Record initial and post-discussion scores. Panels that revise uniformly downward are seeing more problems than expected — a healthy signal.

**Background dispatch**: Running agents in background lets the lead continue working.

---

## Common Mistakes

**No persistent checklist**: Without `EVAL-CHECKLIST.md`, each panel re-discovers the same issues. The checklist is what makes the process improve over time rather than repeat.

**Vague acceptance criteria**: "Fix the bug" is not acceptance criteria. "Field removed from type definition and all references updated" is. Future agents can verify the latter with a file read; they can't verify the former.

**Vague specialization**: "Agent 3 does code quality" duplicates what every other agent notices. Be specific.

**Skipping the discussion round**: The value comes from cross-pollination. Without it, you have fast independent assessments that miss cross-domain blind spots.

**Broadcasting too early**: Don't broadcast until all agents have submitted. Premature sharing anchors later reporters.

**One discussion round is usually enough**: A second round rarely surfaces net-new findings.

**Conflating Discovery and Verification mode**: In Verification mode, the primary job is confirming items CLOSED, not finding new things. New findings are still welcomed but shouldn't dominate the report.

**Pre-research context contamination**: The context block given to all agents is a shared attack surface. One wrong assertion in pre-research — especially a false absence claim — propagates to all N agents simultaneously. The cross-panel structure cannot self-correct this because all agents start from the same poisoned context. Never infer "X doesn't exist" from a search result that may have been truncated or scoped incorrectly. Verify absence with a direct path check before asserting it.

**Searching without excluding ignored directories**: Running Glob or Grep without excluding generated, vendored, or dependency directories produces truncated results that hide actual project files. Always respect `.gitignore` patterns. Scope searches to source directories. Use direct path checks to verify specific files rather than inferring their presence or absence from broad search results.

**Flagging intended behavior as a defect**: Agents sometimes cite behavior as a "bug" or "hidden side effect" that is actually the artifact's explicit purpose. Before labeling any behavior as wrong, check the README, documentation, or stated design intent. What looks surprising in a general codebase may be the core contract of a domain-specific tool. The domain intent gate in Phase 1 exists precisely to prevent this.

---

## Phase 6 — Skill Self-Improvement (Recursive)

This phase is the mechanism that makes the skill get better with every run. It is not optional and it is not a summary — it produces concrete, targeted edits to the skill files.

### Step 1: Diagnose What Failed

For each phase, ask: did it work as intended? Specifically examine:

1. **Phase 1 (Pre-Research)**: Did any absence claim turn out to be wrong? Did search results get truncated by ignored directories? Did the context block contain any misinformation that agents repeated?
2. **Phase 3 (Agent prompts)**: Did agents flag behavior that turned out to be intentional design? Did any agent repeat a pre-research error without verifying it? Did any specialization miss an obvious gap from its domain?
3. **Phase 4 (Discussion)**: Did the discussion surface findings that contradicted pre-research facts? Were those corrected or propagated?
4. **Phase 5 (Synthesis)**: Did any finding in the final report get challenged by the user as wrong? What was the root cause?
5. **Cross-cutting**: Was the skill's overall output accurate enough to be useful, or did it require significant correction after delivery?

### Step 2: Identify Specific Improvements

Map each failure to the exact section of the skill that caused it. Be specific:

| Failure | Root Cause | Skill Location | Fix |
|---------|-----------|----------------|-----|
| "No README" false finding | Glob truncated by node_modules | Phase 1 search instructions | Add mandatory absence verification rule |
| "setupTmpDir is a hidden side effect" | Agents didn't check domain intent | Phase 3 agent prompt template | Add domain intent gate to every agent prompt |
| Phase 6 produced only a proposal, not a fix | Phase 6 was too passive | Phase 6 instructions | Make self-improvement apply changes directly |

### Step 3: Apply Improvements Immediately

**Do not just propose — apply.** After identifying improvements:

1. Edit the relevant skill files directly using the Edit tool
2. Bump the skill version in the frontmatter (patch for fixes, minor for new capabilities)
3. Update the `EVAL-CHECKLIST.md` for this run to record: "Phase 6 updates applied: [list what changed]"

The goal is that the *next run of this skill* behaves differently because of what this run learned. A proposal that requires a follow-up conversation to apply is a failed feedback loop.

**Exception**: If a proposed change would significantly alter the skill's behavior in ways the user hasn't reviewed, present it first and ask for confirmation. For targeted fixes to documented failures (wrong output, false findings), apply directly.

---

## Additional Resources

### Reference Files

- **`references/agent-specializations.md`** — Standard specialization templates by domain
- **`references/discussion-protocol.md`** — Full discussion prompt template and tension resolution
- **`references/report-format.md`** — Complete report structure with section templates

### Examples

- **`examples/package-evaluation.md`** — Complete example: evaluating an npm package for production readiness
