---
name: reconcile-tickets
description: Make a project's tickets match what actually happened. Compares each ticket with the merged pull requests and the plan, proposes which to close, update, create or drop, applies the changes after you approve, and reports progress against the goal as a count you can check. Use when asked to update the tickets, reconcile the tickets with the work, get the tracker up to date, how far are we from the goal, what percent complete are we, or turn this plan into tickets.
---

# Reconcile tickets

Input: a project, epic or filter in a tracker, the repos the work lands in, and the plan or goal document when there is one. Output: tickets that match reality, and a progress summary.

Works with any tracker you have a tool for, such as GitHub Issues, Jira or Linear.

## Steps

### 1. Read the three sources

- **The tracker:** every ticket in scope, read fresh in this run. Do not reuse a list from earlier in the conversation.
- **The code:** pull requests merged and open in the period, in every repo the work touches.
- **The plan:** the goal document, with each item it promises.

### 2. Give every ticket a state

For each ticket, find the evidence and pick one:

| State | Evidence |
|---|---|
| Done | A merged pull request, a release or a deployed change that does what the ticket asks |
| In progress | An open pull request or an active branch |
| Not started | Nothing found |
| Obsolete | The plan changed, with the decision that changed it |
| Duplicate | Another ticket covers the same work |

Read the ticket's description and comments before you decide. A merged pull request that mentions a ticket may cover only part of it.

### 3. Give every plan item a ticket

Match each item in the plan to a ticket. Reuse an existing ticket when one covers the item, and update its text when the plan now says more. Propose a new ticket only for an item that has none. Propose the smallest set that tracks the work.

### 4. Propose the changes

| Ticket | Now | Proposed | Evidence |
|---|---|---|---|
| Key and title | Current state | Close, move, update, create or drop | The pull request, release or decision |

Show the table and ask once for the whole batch. Changing a ticket is a write to a shared system, so apply nothing before the user approves.

### 5. Apply

For each approved row, make the change and add a short comment with the evidence, such as the pull request link. Keep an assignee as it is unless the user says otherwise.

In a public repo, never write a private tracker's keys or links into a pull request, a commit or a file. The ticket links to the pull request, not the other way round.

### 6. Report progress against the goal

1. One sentence: how far the work is from the goal.
2. The count: items done out of items the goal needs, such as "9 of 14 done, 3 in progress, 2 not started". Give a percentage only next to the count it comes from.
3. What is at risk, and what would bring it back.
4. What changed in the tracker in this run.

Say how you counted. When items differ a lot in size, say so instead of weighting them with made-up numbers.

## Done when

- Every ticket in scope has a state with evidence.
- Every plan item maps to a ticket.
- Each approved change is applied, and nothing else changed.
- The progress count shows its numbers.
