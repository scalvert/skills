---
name: resume-work
description: Rebuild where a piece of work stands after an interruption, a long session or a handoff, from git, pull requests, CI, tickets and the plan, not from memory. Reports what is done, what is in flight, what waits on you and the one next step, and says where the work has drifted from its goal. Use when asked where are we, what is left, what is next, pick up where we left off, I was away, I lost track, or step back and reassess.
---

# Resume work

Input: a repo or a set of repos, and the goal if the user names one. Output: a short status the user can act on. It changes nothing.

## Principles

- **Evidence, not memory.** A summary from earlier in the conversation is a claim. Check each item against git, the pull requests and CI before you repeat it.
- **Measure against the goal.** List the work the goal needs, then find its state. A list of everything that happened does not answer the question.
- **Short.** The user asked because they lost track. A long report loses them again.

## Steps

### 1. Find the goal

Look for it in this order: the user's message, the plan or design document, the tracking ticket, the pull request description, then the first request of the session. Write the goal in one sentence. When you find two goals that disagree, or none, ask before you go on.

### 2. Collect the current state

Run these in every repo the work touches:

```sh
git fetch -q origin
git status -sb
git worktree list
git stash list
git branch -vv                                  # look for "ahead" and for branches with no upstream
gh pr list --author @me --state open --json number,title,isDraft,reviewDecision,statusCheckRollup,url
gh pr list --author @me --state merged --limit 20 --json number,title,mergedAt
```

Then check what git does not show:

- Unresolved review threads and failing checks on each open pull request.
- Uncommitted changes in each worktree, and which task they belong to.
- Background work that is still running, such as a subagent, a watch process or a deploy.
- Branches another person or agent is working on in the same repo. Leave them alone, and name them.
- The tickets for this work, when a tracker is available.
- The last release, when the goal is a release.

### 3. Sort each item of the plan

Give every item one state, with its evidence:

| State | Evidence it needs |
|---|---|
| Done | A merged pull request, a release or a deployed change |
| In review | An open pull request, with what blocks it |
| In progress | A branch or worktree with commits or changes |
| Not started | Nothing found |
| Dropped | The decision that dropped it, and who made it |

Work with no pull request is not done. Say so plainly.

### 4. Check for drift

Look for work that happened but is not in the plan, plan items nobody has touched, and decisions that were made without the user. List each one. Do not judge them. The user decides whether the drift is fine.

### 5. Report

Use this order:

1. One sentence: how far the work is from the goal.
2. The table from step 3. Leave out rows the user does not need.
3. **Needs you:** the decisions, approvals and merges that only the user can make.
4. **Drift:** what step 4 found, or "none".
5. **Next step:** one step, and why it comes first.

Give counts as counts, such as "7 of 12 items merged". Give a percentage only when you also give the numbers behind it. Name things by what they are, never by a letter and a number you made up.

### 6. Stop

Do not start the next step unless the user asked you to continue. When they did ask, start it after the report.

## Done when

- Every item in the report has evidence you checked in this run.
- The report names one next step.
- Nothing was changed, pushed or posted.
