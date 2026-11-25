---
name: write-rfc
description: Write or revise an RFC or design document that a reader can scan and act on. Reuses the structure of your earlier RFCs, leads with the problem and the decision, uses exact names and versions, checks every fact, keeps one source of truth, and reviews the document top to bottom for contradictions and loose ends. Use when asked to write an RFC, a design doc or a proposal, turn this into an RFC, merge two proposals, tighten this doc, or reply to review comments on a document.
---

# Write an RFC

Input: a problem, a proposal and the facts behind it. Output: one document, in the format the user already uses.

## Steps

### 1. Find the format

Look for an RFC or design document the user wrote before, and reuse its headings in the same order. Do not rename a heading the earlier document used. When there is none, use this:

1. **Summary:** the problem and the decision, in three to five sentences.
2. **Context:** what exists today and why it is a problem.
3. **Goals and non-goals.**
4. **Proposal.**
5. **Alternatives considered:** each one, and why not.
6. **Risks and open questions:** each question, and who can answer it.
7. **Rollout:** the steps, in order, and how each is undone.

When you revise a document, keep its structure unless the user asks to change it.

### 2. Gather and check the facts

Separate what is verified from what is assumed. Check each fact about the current system against the code, the configuration or the vendor's documentation. See `check-claims`. Mark each assumption as an assumption, and move it to the open questions.

### 3. Write

- State the problem first, then the proposal.
- Open every section with its point.
- Use the exact name of each component, API, field and file. "The local MCP server" is exact. "A local program" is not.
- Use the version number, such as the specification's date or release. Never write "the new version" or "the old version".
- Use one term for one thing, all the way through.
- Put a comparison or a support matrix in a table.
- Name each decision and blocker by what it is about, never by a letter and a number.
- Leave out preamble, a section that only introduces other sections, and who owns or approved what, unless a decision depends on it.
- Cut every sentence that does not help the reader decide or build.

Follow `write-clearly`, and run its script check.

### 4. Keep one source of truth

Keep one copy of the document. When a second copy exists, delete it or replace it with a link. When the same table appears in two sections, keep one and point the other at it.

### 5. Check that it scans

Read only the summary and the headings. The reader must be able to say what is proposed and what is asked of them. When they cannot, fix the summary first.

### 6. Review it top to bottom

Look for contradictions between sections, a term that changes meaning, a step in the rollout that the proposal does not explain, an alternative that is never dismissed, and a claim about the current system that the facts from step 2 do not support. Use `debate-a-decision` for a document that carries a large decision.

## Replying to review comments

For each comment, quote the passage it is about, say whether the reviewer is right after you check it, and give the reply as plain text the user can paste. When the document must change, make the change and say where.

## Done when

- The headings match the user's earlier documents, or the default above.
- Every fact about the current system was checked, and every assumption is marked.
- The summary alone tells a reader the problem and the decision.
- There is one copy of the document.
