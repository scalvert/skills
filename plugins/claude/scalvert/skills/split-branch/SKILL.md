---
name: split-branch
description: Decide before you open a pull request whether the current branch is one reviewable change or should be split, and give concrete split boundaries taken from the diff. Use when asked to split a branch or a pull request, for a check before opening a pull request, or when asked whether a diff is too large. Read-only. For a plan with no code yet, use split-plan.
argument-hint: optional base ref, for example origin/main
---

# Split a branch

Judge the current branch before it becomes a pull request. The result is a verdict and, when the branch is too wide, the pull requests to cut it into, named by file and hunk.

This skill reads. It does not move commits, change branches or open a pull request. The user decides whether to act on the recommendation.

## Input

**Base ref:** `$ARGUMENTS`

When no base is given, find it in this order:

1. The branch's upstream, when it tracks a branch other than its own remote copy.
2. The remote's default branch: `git symbolic-ref --short refs/remotes/origin/HEAD`.
3. `origin/main`, then `origin/master`.

Say which base you used.

## Gather evidence

Start with summaries. Read hunks only where the summary leaves a question open.

```bash
git status --short
git diff --stat <base>...HEAD
git diff --numstat <base>...HEAD
git diff --name-status --find-renames <base>...HEAD
git diff --dirstat=files,10,cumulative <base>...HEAD
git log --oneline <base>..HEAD
```

Also read, when they exist:

- `CODEOWNERS`, in the root, `.github/` or `docs/`.
- Generated-file markers: a `.gitattributes` line with `linguist-generated`, a "do not edit" header, lockfiles, snapshots.
- The repo's notes on stacking tools, such as Graphite or git-town.

Uncommitted changes are not in the diff. If `git status` shows any, say so and ask whether they belong to this pull request.

## What to weigh

Line count alone does not decide it. Weigh:

- Hand-written lines changed, with generated and mechanical lines counted apart.
- Files, directories and packages touched.
- Owners, and so how many reviewers the change needs.
- Languages and runtime layers.
- The kinds of change present: API or schema, behavior, refactor, tests, generated output, docs, config, build.
- Whether the hunks can be understood apart from each other.
- Whether tests sit with the code they test.
- Whether mechanical changes hide the change that matters.

## Output

```markdown
## Verdict
[green | yellow | red]: [one sentence]

## Diff summary
| Measure | Value |
| --- | --- |
| Base | |
| Files changed | |
| Hand-written lines | |
| Generated or mechanical lines | |
| Main directories | |
| Owners | |

## Review risks
- [risk, with the files that cause it]

## Recommended split
1. [pull request title]: [files, hunks or kinds of change]
2. [pull request title]: [files, hunks or kinds of change, and what it depends on]

## How to split it
    [commands for the stacking tool the repo uses, or plain git]

## Fine as one pull request if
- [the condition that would make a split unnecessary]
```

Leave out a section that has nothing in it. A green verdict needs only the verdict and the diff summary.

For "How to split it", use the tool the repo already uses. With no stacking tool, give plain git: a new branch from the base for each part, then `git cherry-pick` for whole commits or `git checkout <branch> -- <path>` for whole files. Name the commits and paths. Do not run the commands.

## Verdicts

- **Green:** one review unit with its tests. Open the pull request.
- **Yellow:** acceptable when one set of owners reviews all of it, but a split would lower the risk. Recommend the split and let the user choose.
- **Red:** do not open the pull request. Show the split and ask whether to split or to go ahead as one on purpose.

## Rules

- Each part of a split builds and passes tests alone. Do not recommend a boundary that leaves an earlier part broken.
- Do not split for its own sake. Two pull requests that cannot be understood apart are worse than one.
- When the user goes ahead with one pull request against a red verdict, say that the reason belongs in its description.
