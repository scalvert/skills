---
name: check-claims
description: Check the factual claims in a thread, a document, a report or a screenshot, one by one, against primary evidence. Gives each claim a verdict with the source that proves it, and says "cannot verify" instead of guessing. Use when asked to validate the claims, verify what this says, fact-check this, cross-reference this with the code or the data, I think some of this is wrong, or is this actually true.
---

# Check claims

Input: a thread, a document, a report or an image that states facts. Output: a table with one row per claim, a verdict and the evidence.

## Principles

- **Look it up.** Never reason your way to a verdict from memory when the code, the configuration, the data or the documentation can answer it.
- **Primary evidence only.** The code at a named commit, a configuration value, a query result, a log line, the specification or the vendor's documentation. Another person's summary is a second claim, not evidence.
- **"Cannot verify" is a verdict.** It is better than a guess, and it tells the user where to ask.
- **No softening.** When a claim is wrong, say it is wrong and show why.

## Steps

### 1. List the claims

Write each factual claim on its own line, in the author's words, with who made it. Include the claims inside screenshots and tables. Split a sentence that makes two claims. Leave out opinions, plans and questions, and say that you did.

### 2. Find the evidence for each one

Search for it. For each claim, decide what would prove it and what would disprove it, then go and look at both.

- A claim about how the code behaves: read the code path, and run it when you can.
- A claim about the current state, such as "the flag is on" or "version 2 is deployed": read the state as it is now. An old document cannot prove a current state.
- A claim about a number: run the query or read the report it came from, and note the time range.
- A claim about another product: read that product's own documentation, and note the date.

When two rows of a list must each be checked against another list, check every row. Do not sample.

### 3. Give a verdict

| Verdict | Meaning |
|---|---|
| Correct | The evidence shows it |
| Incorrect | The evidence shows otherwise. State what is true. |
| Partly correct | State which part holds and which does not |
| Cannot verify | State what you looked at, and what or who could settle it |

### 4. Report

Start with the count: how many claims, and how many of each verdict. Then the table, with the incorrect claims first:

| Claim | Verdict | Evidence |
|---|---|---|
| The claim, quoted | The verdict, and the correct fact when it differs | A file and line, a query, a URL or a log line, with its date |

Use `draft-reply` when the user wants a reply that corrects the thread.

## Done when

- Every factual claim in the source has a row.
- Every verdict except "cannot verify" names evidence you read in this run.
- No verdict rests on memory or on another summary.
