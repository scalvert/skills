# Agent Specialization Templates

Standard agent specializations by evaluation domain. Mix and match as needed. Each entry includes the agent name, focus description, and key questions that specialization should answer.

---

## Software Quality Review (7-agent template) — Primary Default

Used as the primary default for evaluating any software artifact: codebase, feature branch, pull request, or library. Agents map directly to senior SWE principle categories. These lenses catch distinct failure modes that domain-specific templates miss.

| Agent Name | Focus | Key Questions |
|---|---|---|
| `code-structure-reviewer` | Encapsulation, SRP, composition over inheritance, abstraction level | Are functions single-responsibility? Is there premature abstraction (extracted without proven duplication)? Does the code use composition over inheritance? Are module boundaries clean? |
| `decoupling-reviewer` | Dependency injection, global state, side-effect isolation, testability | Can core logic be unit-tested without mocking the world? Are side effects pushed to edges? Is there hidden global state that makes testing fragile? Are dependencies injected or hardcoded? |
| `testing-reviewer` | Behavior vs. implementation tests, coverage quality, test code quality | Do tests verify behavior/contracts or implementation details? Would refactoring internals break tests that should still pass? Is test code held to the same quality bar as production code? Do tests document expected behavior? |
| `naming-clarity-reviewer` | Name expressiveness, abbreviations, data structure shape | Do names express meaning or mechanics? Are there cryptic abbreviations or shorthands? Do data structure shapes communicate their purpose? Would a new team member understand this without explanation? |
| `error-handling-reviewer` | Fail-loudly discipline, error modeling, boundary validation | Are errors modeled as first-class values (result types, typed errors)? Does the code fail loudly or silently swallow errors? Is validation done at system boundaries? Is internal code trusted appropriately? |
| `maintainability-reviewer` | Blast radius, explicit vs. implicit, scout rule | What's the blast radius of changing this code? Are behaviors explicit or implicit? Does this violate the principle of least surprise? Does the code leave things cleaner than it found them? |
| `architecture-reviewer` | Layer boundary discipline, domain/infrastructure separation, dependency direction | Are module boundaries clean with no implementation detail leakage upward? Is domain logic contaminated by framework or infrastructure concerns? Do dependencies point in the right direction? Is this designed for replaceability? |

**Devil's advocate variant**: Replace one agent with `devil's-advocate` tasked with: "Argue the strongest possible case for why this code is not ready. Find every reason this would be a mistake to ship."

---

## Domain-Specific Extension Templates

These templates extend or replace the base Software Quality Review for specific evaluation contexts. Layer them on top of the base rubric agents, or use them standalone for domain-focused reviews.

---

## Documentation Quality Audit (4-agent template)

Used when evaluating a documentation set (`docs/` directory) for accuracy against current source code, completeness of feature coverage, style consistency, and user experience. Effective standalone for docs-only reviews or as a complement to release readiness panels.

| Agent Name | Focus | Key Questions |
|---|---|---|
| `accuracy-reviewer` | Cross-reference doc claims against source code | Are API names, function signatures, type names, and mode values correct? Are any functions shown as importable that are not exported from the package root? Are UI element names and component descriptions current? Do file/path references exist? |
| `completeness-reviewer` | Features in code vs features in docs | What features exist in source but have zero doc coverage? What docs describe APIs or behaviors that no longer exist? Are breaking changes (renames, removals) accompanied by migration notes? |
| `style-reviewer` | Emojis, tone, formatting consistency | Are there emojis (explicit project prohibition)? Is tone direct and technical (not marketing-y)? Are code blocks language-tagged? Are internal link formats consistent? Is terminology used consistently ("eval dataset" vs "evaluation dataset")? |
| `user-journey-reviewer` | Can a real user follow the docs to accomplish tasks? | Walk 3-4 common user journeys (quickstart, eval setup, transport config, OAuth). At what steps would a user get confused, hit import errors, or get wrong output? Are all prerequisites stated upfront? |

**Pre-research for documentation audits** (do these before spawning agents):
1. List all doc files and note which were most recently changed relative to major breaking PRs
2. Scan for broken internal links: `grep -rn "\[.*\](.*\.md)" docs/` and verify each target file exists
3. Check for phantom exports: identify functions shown in code examples and verify they appear in `src/index.ts`
4. Note the most recent breaking changes (renames, removals) that would require doc updates

**Panel size guidance**: 4 agents is typically right for a focused docs audit. Scale to 5-6 if the documentation set is large (15+ files) or if there are multiple distinct feature domains (e.g., eval system + auth + reporter + CLI all need domain-accurate review).

---

## Package / Library Evaluation (10-agent template)

Used when evaluating a software package, library, or framework for production adoption.

| Agent Name | Focus | Key Questions |
|---|---|---|
| `production-readiness` | Versioning, stability, maintenance | Is this ready to depend on? What's the breaking change risk? What's the bus factor? |
| `implementation-correctness` | Core logic bugs, edge cases, async safety | Does the fundamental logic work? What fails under edge conditions? |
| `protocol-compliance` | Spec adherence, standard implementation | Does it correctly implement the protocol/standard it claims? |
| `security-analyst` | Auth, credential handling, CVEs, injection | What are the exploitable attack surfaces? What are the current CVEs? |
| `remote-suitability` | Network resilience, retry, auth in CI/CD | Does it work reliably over real networks? Can it be used in headless CI? |
| `eval-correctness` | Eval methodology, judge quality, statistical validity | Are the evals methodologically sound? Would results be trustworthy? |
| `eval-framework-patterns` | Comparison to industry standards | How does it compare to Braintrust/Promptfoo/HELM? What's missing? |
| `developer-experience` | API ergonomics, docs, onboarding | How long to first working test? What's confusing? What's delightful? |
| `test-infrastructure` | Coverage, test quality, dogfooding | Does the framework test itself adequately? What's dangerously untested? |
| `alternatives-researcher` | Competing tools, build-vs-buy | What else exists? What's the rebuild cost? When should you use each? |

**Devil's advocate variant**: Replace one agent with `devil's-advocate` tasked with: "Argue the strongest possible case for NOT adopting this package. Find every reason this would be a mistake."

---

## Security Audit (6-agent template)

Used when doing a focused security review of a codebase, service, or package.

| Agent Name | Focus | Key Questions |
|---|---|---|
| `auth-reviewer` | Authentication, authorization, session management | Can someone authenticate as someone else? Are tokens handled securely? |
| `input-validation` | Injection, XSS, deserialization | What untrusted input reaches which code paths? What's not sanitized? |
| `dependency-auditor` | CVEs, supply chain, license risk | Which dependencies have known vulnerabilities? What's the transitive exposure? |
| `secrets-hunter` | Hardcoded secrets, logging of sensitive data | Are credentials, tokens, or PII logged or hardcoded? |
| `network-security` | TLS, encryption, certificate handling | Is data in transit protected? Are there downgrade risks? |
| `threat-modeler` | Attack surface mapping, business logic flaws | What can an attacker do from the outside? What can a malicious insider do? |

---

## Library / Published Package Architectural Review (5-agent template)

Used when evaluating the design soundness of a published library or package — not pre-release readiness, but long-term structural health. Findings use **structural risk / evolution friction / acceptable tradeoff** language, not blocker/should-fix. The question is not "is this ready to ship?" but "where will this cause pain as it grows?"

| Agent Name | Focus | Key Questions |
|---|---|---|
| `api-contract-reviewer` | Public surface design, ergonomics, evolution cost | Is the API intuitive to use correctly and hard to misuse? What will be painful to change in v5? Are there type-level guarantees that enforce correct usage, or does the API rely on convention and documentation? |
| `abstraction-reviewer` | Abstraction quality, coupling, hidden dependencies | Are the right things abstracted? Is there hidden coupling between parts that appear independent? Does the design make common cases easy and rare cases possible, or does it sacrifice one for the other? |
| `extensibility-reviewer` | Extension points, subclassing seams, composition patterns | How does a user extend or customize behavior? Are the seams in the right places? Does the extension model scale to use cases beyond the documented ones? |
| `state-and-lifecycle-reviewer` | Shared state, ordering dependencies, lifecycle correctness | Is shared mutable state visible or hidden? Are there implicit ordering requirements that the API does not enforce? Can the library be used safely in concurrent or parallel environments? |
| `consumer-experience-reviewer` | Real-world usage patterns, error experience, learning curve | Walk through the documented usage patterns. Where does a new user get confused? When something goes wrong, are errors actionable? Does the library guide users toward correct usage or require tribal knowledge? |

**Severity language for library architectural reviews:**
- **Structural risk**: Design choice that will require a breaking change or significant refactor to fix as the library grows
- **Evolution friction**: Design choice that makes adding features harder than it needs to be, without requiring a break
- **Acceptable tradeoff**: Known limitation with a reasonable justification; document but don't change

---

## Architecture / Design Review (7-agent template)

Used when evaluating a system architecture, API design, or technical design document.

| Agent Name | Focus | Key Questions |
|---|---|---|
| `api-designer` | API ergonomics, consistency, backward compatibility | Is the API intuitive? Is it consistent? What will be painful to evolve? |
| `scalability-analyst` | Performance, bottlenecks, horizontal scaling | Where will this break under load? What can't scale? |
| `resilience-reviewer` | Failure modes, error handling, graceful degradation | What happens when dependencies fail? Is there a circuit breaker? |
| `data-modeler` | Data schema, relationships, migration complexity | Is the data model correct? What's the migration story? |
| `observability-analyst` | Logging, metrics, tracing, alertability | Can you debug production issues? Can you detect regressions? |
| `security-architecture` | Defense in depth, trust boundaries, data classification | Where are the trust boundaries? What's the blast radius of a breach? |
| `devil's-advocate` | Argue the strongest case against this design | What's the most likely way this architecture fails in 2 years? |

---

## Pull Request / Code Review (5-agent template)

Used when doing a deep multi-perspective review of a significant PR or feature implementation.

| Agent Name | Focus | Key Questions |
|---|---|---|
| `correctness-reviewer` | Logic bugs, edge cases, off-by-one errors | Does the code do what it claims? What inputs will break it? |
| `test-reviewer` | Test coverage, test quality, missing cases | Are the right things tested? What's not tested that should be? |
| `performance-reviewer` | Algorithmic complexity, memory, database queries | What's the worst-case performance? Are there N+1 queries or unnecessary allocations? |
| `security-reviewer` | Injection, auth, data exposure, OWASP top 10 | Does this PR introduce any security regression? |
| `maintainability-reviewer` | Readability, coupling, abstraction quality | Will the next person understand this? Does it increase or decrease complexity? |

---

## Agent Prompt Template

Use this structure for each agent prompt:

```markdown
You are a [specialization] expert assessing [SUBJECT] for [USE CASE].

## Subject Context (Pre-Research)
[Paste the pre-research findings here — version, description, key metadata]

## Your Focus: [SPECIALIZATION]
Assess:
1. [Specific question 1]
2. [Specific question 2]
3. [Specific question 3]
...

## Scope
Examine these paths preferentially: [list 2-4 key directories]

## Required Output Format
Structure your response as:

### [Specialization] Assessment

**Overall Rating:** X/10

**Findings:**
| Severity | Finding | File:Line | Confidence |
|----------|---------|-----------|------------|
| Critical/High/Medium/Low | [description] | file:line | High/Medium/Low |

**Strengths:**
[What's done well]

**Recommendations:**
[Prioritized list of specific, actionable fixes]

When done, send your findings to the team lead via SendMessage.
```

---

## Specialization Scoping Tips

**Focus agents on specific file paths** to prevent duplicate coverage and reduce token waste:

```
security-analyst: src/auth/, src/cli/
protocol-analyst: src/mcp/, src/spec/
eval-correctness: src/evals/, src/judge/
dx-analyst: docs/, examples/, src/index.ts
test-infrastructure: tests/, *.test.ts, .github/
```

**Give agents research questions, not conclusions.** "Does retry logic exist?" is better than "Review reliability." The more specific the question, the less the agent wanders.

**Include what NOT to assess** to prevent overlap: "Do NOT review the auth module — another agent covers that. Focus exclusively on the eval runner."
