### Suggest rules for repeated findings

```sh
node <skill>/scripts/agent-review.mjs ledger summary --repo <repo>
```

`repeatedClasses` lists bug classes found at least 3 times across at least 2 reviews of this repo. For each one, suggest a single line to the user after the report. Its `suggest` field says which kind:

- People fixed it: a rule that prevents it, as an `AGENTS.md` convention or a lint rule.
- People called it wrong, intended or not worth fixing: a `REVIEW.md` line that tells reviewers not to raise it.

Skip a class whose `suggest` is null: people's decisions on it do not lean either way yet. Suggest only. Do not edit those files unless the user asks.
