---
name: split-plan
description: Decide before coding whether a plan, ticket or proposed scope should become several pull requests, and give the stack to build. Use when asked to split a plan or a piece of work, when a request is broad ("update all usages", "migrate everything", "clean up"), when a change will mix a refactor with new behavior, or before an agent starts a large implementation. For a branch that already has commits, use split-branch.
argument-hint: plan text, ticket link or implementation goal
---

# Split a plan

Judge a plan before any code exists. Splitting is cheap at this point and costly after the branch is written. The result is a verdict and, when the plan is too wide, an ordered list of pull requests that a reviewer can each read in one sitting.

## Input

**Plan or goal:** `$ARGUMENTS`

If the input is empty or the literal "$ARGUMENTS", ask for the plan, a ticket link or a one-line goal, and stop.

## Steps

1. Read the source. If the input is a ticket or a document link, read it before you judge scope.
2. State the outcome in one sentence. If you cannot, the plan holds more than one outcome. That is the first sign it needs a split.
3. List the review surfaces: each part of the codebase the plan touches, what changes there, and what a reviewer of that part has to decide.
4. Look at the repository only as far as you need to name packages, owners (`CODEOWNERS`), generated files and test locations. Do not start the implementation.
5. Check the plan against the risk signals below.
6. Give the verdict and the stack.

Ask at most one question, and only when the answer would change the verdict. Otherwise state your assumptions and continue.

## Risk signals

A plan needs a split when it has any of these:

- A refactor and a behavior change in the same change.
- A schema, API, protocol or config change together with the migration of its callers.
- Backend, frontend and infrastructure work in one review.
- Generated files mixed with hand-written logic.
- More than one owning team or reviewer group.
- Wide wording: "update all usages", "standardize", "migrate everything", "fix across the codebase".
- Mechanical churn large enough to hide the change that matters.
- Work that needs a rollout plan, a data migration or backward-compatibility reasoning.

## How to cut a stack

- Put the change that others depend on first: the interface, schema or flag. It ships with no callers.
- Give mechanical changes (renames, moves, formatting, generated output) their own pull request. A reviewer can skim one of those in a minute when nothing else is in it.
- Keep a refactor that makes the feature possible apart from the feature.
- Each pull request builds, passes tests and can be reverted alone.
- Keep tests with the code they test.
- Hide unfinished behavior behind a flag instead of holding one long branch open.

## Output

```markdown
## Verdict
[green | yellow | red]: [one sentence]

## Why
- [each risk signal that applies, with the part of the plan that triggers it]

## Review surfaces
| Surface | Change | What the reviewer decides |
| --- | --- | --- |

## Recommended stack
1. [pull request title]: [scope, and why it stands alone]
2. [pull request title]: [scope, and what it depends on]

## Keep out of each pull request
- [what must not be mixed in]
- [what is mechanical or generated and goes separately]

## Assumptions
- [each assumption you made]
```

Leave out a section that has nothing in it.

## Verdicts

- **Green:** one reviewer concern, a narrow set of files, no refactor mixed with behavior. Build it as one pull request.
- **Yellow:** one feature, but enough files or reviewers that a stack would be easier to review. Recommend the stack and let the user choose.
- **Red:** more than one concern. Do not start the implementation. Show the stack and ask whether to build it as a stack or to accept one large pull request on purpose.

## Rules

- Do not judge by line count alone. Five hundred lines of one idea review faster than eighty lines of three.
- Do not split for its own sake. Two pull requests that cannot be understood apart are worse than one.
- When the user accepts one large pull request against a red verdict, say that the reason belongs in its description.
