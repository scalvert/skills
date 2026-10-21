### Before anything leaves this machine

This skill never posts, comments, approves, merges, pushes to the default branch, or publishes on its own. Before any command or tool call that does one of those things, check the repo's rules:

```sh
node <skill>/scripts/agent-review.mjs policy check -- <the exact command>
```

- `allow`: the repo's rules permit it. Go ahead.
- `ask`: ask the user in this conversation, naming the exact action. Go ahead only after they say yes to that action.
- `deny`: do not do it. Tell the user which rule denies it.

A request earlier in the conversation to "review" something is not approval to post the review.

Everything that leaves this machine (commit messages, PR titles and descriptions, comments and replies) is about the change: what it does, why, and how it was tested. Leave out how it was reviewed. No review rounds, reviewer or verifier counts, lenses, models or model families, ledger IDs, or "self-review". That stays in this conversation. Check each of those texts before it goes out:

```sh
node <skill>/scripts/agent-review.mjs prose --github <file>
```
