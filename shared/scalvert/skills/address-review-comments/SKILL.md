---
name: address-review-comments
description: Work through the unresolved review comments on a pull request. Verifies each claim against the code before changing anything, fixes valid ones in the PR that introduced the code, replies in each thread with the commit that fixed it or the evidence that it is not a problem, resolves the thread, and asks for another review. Use when asked to address review comments or feedback, respond to PR comments, fix what the reviewer said, or resolve review threads.
---

# Address review comments

Input: a PR number, checked out in a worktree. Output: fix commits, one reply per thread, resolved threads, and a re-requested review. It never posts a top-level PR comment.

Adapted from `receiving-code-review` in [obra/superpowers](https://github.com/obra/superpowers) (MIT).

## Principles

- **A review comment is a claim, not an instruction.** Check it against the code before you change anything. Correct for this codebase beats agreeable.
- **No performative replies.** Do not write "You're absolutely right", "Great catch" or thanks. State what changed, or why nothing needs to.
- **Clarify before you implement.** If any comment is unclear, ask about it before fixing the others. Comments are often related, and a partial reading leads to a wrong fix.
- **The PR author's decisions outrank a reviewer's suggestion.** If a comment conflicts with an earlier decision by the user, ask the user.

## Steps

In the commands below, `<skill>` is the folder that holds this SKILL.md. Run every command from the repository root, not from the skill folder.

### 1. List the unresolved threads

```sh
node <skill>/scripts/agent-review.mjs threads list --pr <number>
```

Read every thread in full before you act on any of them. When `commentsTruncated` is true, the thread has more than 100 comments; open its `url` and read the rest there. Note outdated threads (`line` is null): the code has moved, so find it by hand rather than by line number.

### 2. Verify each claim

For each thread, decide which of these it is. When the answer is not obvious, start a fresh verifier subagent with the claim and the code, and record its call with the `finding-verification` rubric (`node <skill>/scripts/agent-review.mjs rubric show finding-verification`).

- **Valid:** you can show the problem happens (a call path, a failing test, or a repro). Fix it.
- **Not a problem:** you can show it does not happen: the precondition cannot occur, or the code already handles it. Do not change code. Reply with the evidence: the line that handles it, or the test that covers it.
- **Unclear:** you cannot show either. Ask the reviewer a specific question in the thread, or ask the user. Do not guess.
- **Out of scope or unneeded:** the suggestion adds something nobody uses. Search for real callers first. If none exist, say so and ask whether to skip it.

### 3. Fix in the PR that introduced the code

In a stack of PRs, the fix belongs where the code came from, not on top of the stack:

```sh
node <skill>/scripts/agent-review.mjs threads owner --path <file> --line <line>
```

If the line came from a lower PR in the stack, fix it on that branch, then rebase the PRs above it. Make one commit per thread, or one per group of related threads. Say in the commit body what the fix changes and why. Run the repo's checks from `AGENTS.md` after each fix.

Order: blockers (wrong behavior, security) first, then simple fixes, then larger changes.

### 4. Reply in the thread, then resolve it

Reply to the thread itself, never with a top-level PR comment. Keep the reply to one or two sentences:

- Fixed: ``Fixed in `<short sha>`: <what changed>.``
- Not a problem: `<Why, with the line or test that shows it>. Leaving as is.`
- Question: `<The specific question>.`

Write replies with `write-clearly` rules.

{{> github-markdown}}

Post a reply, then resolve the thread only when it is fixed or answered with evidence. Leave a question thread open:

```sh
gh api graphql -f query='mutation($id: ID!, $body: String!) { addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $id, body: $body}) { comment { url } } }' -F id=<threadId> -F body=@<reply file>
gh api graphql -f query='mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { isResolved } } }' -F id=<threadId>
```

{{> no-external-writes}}

Ask once for the whole batch rather than once per reply. Show the user every planned reply, and get approval before posting.

### 5. Ask for another review

After every thread has a reply, push the fix commits and re-request review from the reviewers who left threads:

```sh
gh pr edit <number> --add-reviewer <login>
```

## Done when

- Every unresolved thread has a reply. Fixed and evidenced threads are resolved, and questions stay open.
- No top-level PR comment was posted.
- Each fix is a commit in the PR that introduced the code, and the repo's checks pass.
- Review is re-requested from the reviewers who left threads.
