---
name: code-review
description: Review a GitHub pull request with independent reviewers on at least two model families, verify every finding against the code, and return a verdict with numbered blockers and draft line comments. On a pull request it reviewed before, it reviews only the new commits, checks each earlier finding in its review thread, and says whether it was fixed. Never posts anything. Use when asked to review a PR, do a code review, re-review, take another look, or check whether review feedback was addressed.
---

# Code review

Input: a PR number or URL, in the repository's checkout. Output: a report in this conversation, draft line comments, and a ledger entry. Nothing is posted to GitHub.

For your own branch before anyone else reviews it, use `self-review`. To work through comments on your own PR, use `address-review-comments`.

## Steps

In the commands below, `<skill>` is the folder that holds this SKILL.md. Run every command from the repository root, not from the skill folder.

### Find the round

Check whether this PR was reviewed before:

```sh
node <skill>/scripts/agent-review.mjs ledger last-head --repo <owner/repo> --key <number>
```

- **It prints nothing:** this is a first review. Pin the whole PR:

  ```sh
  node <skill>/scripts/agent-review.mjs pin --pr <number>
  ```

- **It prints a commit:** this is a follow-up review. Pin only the commits since that one:

  ```sh
  node <skill>/scripts/agent-review.mjs pin --pr <number> --since <last head>
  ```

  If the author force-pushed, the last head is no longer an ancestor of the PR head and `--since` fails. Pin the whole PR instead, and say in the report that history was rewritten. When the user asks for a full review, also pin the whole PR. In both cases, still check the earlier findings below.

The key is the PR number. Read the code at the PR head, for example in a read-only worktree: `git worktree add .worktrees/review-<number> <head>`. Remove it when you finish.

### Check the earlier findings (follow-up only)

List every finding that is still open: reported in an earlier round and not yet closed.

```sh
node <skill>/scripts/agent-review.mjs ledger open --repo <owner/repo> --key <number>
```

A finding from a posted review has a GitHub thread. For each open finding whose `thread` is empty, list the threads and find the one at its file and line:

```sh
node <skill>/scripts/agent-review.mjs threads list --pr <number> --all
node <skill>/scripts/agent-review.mjs ledger link --repo <owner/repo> --key <number> --id <id> --thread <threadId> --url <url>
```

Read the thread: the author may have replied there. Then check the new code and decide:

- **Fixed:** the scenario no longer happens. Record `dispose --as fixed`, and draft a reply for its thread: ``Fixed in `<short sha>`.``
- **Not fixed:** the scenario still happens. Keep it open, and draft a reply for its thread that says why.
- **Answered:** the author replied with a reason, and the reason holds. Record what they said, with `--note "<reason>"`: `dispose --as wrong` when the problem cannot happen, `--as intended` when the behavior is on purpose, or `--as not-worth-it` when it is real but not worth fixing. When the reason does not hold, keep the finding open and say why in its thread.

The ledger keeps each finding's ID across rounds. The ID is an internal key for these commands: never show it. Name a finding by its title and location.

### Pin the change

Run the context command from the step above. It writes one directory with the diff, changed files, commits, the spec (PR description and linked issues), the repo's `AGENTS.md` and `REVIEW.md`, and the reviewer's axioms when present. It prints `context.json`. Every reviewer reads this directory, so they all see the same inputs.

Then start a ledger round:

```sh
node <skill>/scripts/agent-review.mjs ledger start --repo <owner/repo> --key <key> --base <mergeBase> --head <head> --lenses <comma-separated lenses>
```

Take `repo`, `key`, `mergeBase`, `head` and `lenses` from `context.json`. `REVIEW.md` rules override the general guidance below.

The ledger allows 3 rounds. After that, `start` refuses, because later rounds mostly find older problems instead of new ones. Stop and tell the user that this change has had 3 reviews, and suggest that the author step back and reconsider the approach. Start another round with `--past-cap` only when the user asks for one.

### Run the panel

Run one reviewer per lens in `context.json` (3 to 6), even for a small diff. A small diff only makes each reviewer quicker. Do not review it yourself instead of running the panel. Each reviewer starts with a fresh context, sees only the pinned directory and the repository, and does not see the other reviewers' findings. Get each reviewer's prompt from:

```sh
node <skill>/scripts/agent-review.mjs lens prompt <lens> --context <dir>
```

Spread the lenses across at least two model families:

- **Tau:** start the reviewers as parallel subagent tasks. Give about half of them a model from another provider (set `model` to `provider/model-id`).
- **Claude Code:** start the reviewers as parallel subagents. Run correctness and one other lens on a second family with `node <skill>/scripts/agent-review.mjs lens run <lens> --via codex --context <dir> --repo-dir <repo>`.
- **Codex:** start the reviewers as subagents. Run correctness and one other lens with `--via claude`.

Wait for every reviewer to return before the next step, and do the same for verifiers. Never end your turn while a subagent is still running: in a non-interactive session, ending the turn ends the review.

If no second family is available, say so in the report. Do not present a single-family review as cross-checked.

Each reviewer returns a JSON array of findings: `file`, `line`, `title`, `precondition`, `scenario`, `evidence`, `axiom` for taste findings, `class` (the kind of bug, in kebab-case), and `instances` (every other place with the same mistake). Record every reviewer that ran, including one that found nothing, and set `lens` and `model` on each finding. Then add all the findings to the ledger:

```sh
node <skill>/scripts/agent-review.mjs ledger ran --repo <repo> --key <key> --lens <lens> --model <provider/model> --findings <count>
node <skill>/scripts/agent-review.mjs ledger add --repo <repo> --key <key> --file findings.json
```

### Merge duplicates

Reviewers often find the same problem. Group findings that share a root cause: same file, nearby lines, and the same failing scenario. Keep the clearest one as the primary, and merge the rest into it:

```sh
node <skill>/scripts/agent-review.mjs ledger merge --repo <repo> --key <key> --into F1 --ids F4,F7
```

The duplicates stay in the ledger, and the report shows how many reviewers and model families found the problem. Merge only true duplicates. Two different bugs on the same line stay separate.

In a follow-up round, also merge a new finding into an earlier finding it repeats, from `ledger open` or the ledger file. That covers earlier findings that were closed, too: a finding the author called wrong or intended must not come back. `ledger report` refuses while a new finding sits in the same file as an earlier one, on nearby lines or with the same class. Merge it, or pass `--keep <id>` when it is a different bug.

### Verify every finding

A reviewer's finding is a claim, not a fact. For each primary finding, start a fresh verifier: a subagent that did not write the finding, on a different model from its author when possible. Give it the finding, the pinned directory, and the rubric from `node <skill>/scripts/agent-review.mjs rubric show finding-verification`. The verifier reads the code itself. It must show that the precondition can occur, and give the call path or a repro, before it answers `confirmed`. Record its answer:

```sh
node <skill>/scripts/agent-review.mjs ledger decide --repo <repo> --key <key> --id F1 --kind finding-verification --json '{"label":"confirmed","probability":0.85,"model":"<provider/model>","rationale":"..."}'
```

When two reviewers disagree about the same code, or a verifier is unsure (probability from 0.4 to 0.7), get one more opinion from a reviewer on a third model, or on the family that has not seen the finding yet. Show it the claim without its author or the earlier verdicts, and record that answer as the verification decision.

The verifier also checks each place in `instances`. Name any that do not hold in its rationale, and leave them out of the report.

For every confirmed finding, also record `finding-severity` (blocker, should-fix or nit), `finding-triage` (agent-fixable or needs-judgment) and `finding-origin` (introduced, missed or pre-existing), using each kind's rubric from `node <skill>/scripts/agent-review.mjs rubric show <kind>`. Only an introduced finding can be a blocker. The report moves a missed or pre-existing blocker to should-fix, and refuses a blocker with no origin.

### Select what to report

```sh
node <skill>/scripts/agent-review.mjs ledger report --repo <repo> --key <key>
```

This keeps confirmed findings at or above the verification threshold (0.7). It gives each one a `section` (blockers, should-fix, pre-existing, smaller) and a number `n` in report order, and it gives `counts` per section. It lists the IDs it dropped and the model families that took part. It refuses to run while a chosen lens has no recorded run or a finding has no verification. Fix the gap; do not work around it. Use `--allow-missing` only when a lens truly could not run, and name the skipped lenses under **Not checked**. Report only what it returns.

In a follow-up review, a new **blocker** must come from a problem the new commits introduce. The verifier labels a problem that was already there at the last reviewed head `missed`, and the report puts it under **Should fix**. Raising new blockers late, for old code, keeps a PR from converging.

### Write the report

Use this shape, and nothing longer than the content needs:

```markdown
**Verdict:** Needs changes: 1 blocker, 2 should fix. <One sentence that says why.>

**Blockers**
1. `path/file.ts:42` <title>. <scenario in one or two sentences>. <evidence: the call path or repro>. Also at `path/other.ts:7`. (Found by 3 reviewers on 2 model families.)

**Should fix**
2. ...

**Pre-existing** (not from this change)
3. ...

**Smaller items** (at most 5; drop the rest)
- ...

**Checked:** <lenses run>, on <model families>, at <short head SHA>. <What you ran, such as tests or a repro, or "Read only.">
**Not checked:** <anything a reader might assume you covered but you did not>.
```

Rules for the prose:

- Lead with the verdict, and start it with the counts from `counts`. When the report has no findings, write `**Verdict:** Ready to merge. Nothing to fix.` and leave out the finding sections.
- Put each finding in the section the report output gives it. Leave out a section that has no findings. A finding in `unrated` has no severity: record one and run the report again.
- Number the findings 1, 2, 3 in report order, across sections, using `n` from the report output. Never show ledger IDs (F1, F2): they mean nothing to anyone else. Keep the map from number to ledger ID for later commands in this conversation, so the user can say "fix 2".
- One finding per item. Give file and line, the scenario, and the evidence. List every other place from `instances` on the same item. Leave out praise and summaries of the diff.
- Mark a finding whose origin is `missed` with "missed in an earlier round".
- Put code in backticks: identifiers, calls, paths, `file:line`, commands, flags and values.
- Plain words, short sentences, active voice. No em dashes, no emoji, no "it's worth noting".
- Cite the `REVIEW.md` rule or axiom ID when a finding rests on one.
- Leave out the dropped findings. They stay in the ledger.

Save the report and draft comments to a file and run `node <skill>/scripts/agent-review.mjs prose --github <file>`. Fix each flag, or keep it on purpose (for example, a quoted error message), before you show the report.


Start every report with the round: `First review at <short head SHA>.` or `Follow-up review since <short last head>.` In a follow-up, add an **Earlier findings** list next, one line per finding, by location and title: ``- `src/page.js:12` Extra item per page: fixed in `<sha>`.``, ``...: not fixed, <why>.``, or ``...: answered, <reason accepted>.`` Then give the verdict and the new findings, numbered from 1.

### Suggest rules for repeated findings

```sh
node <skill>/scripts/agent-review.mjs ledger summary --repo <repo>
```

`repeatedClasses` lists bug classes found at least 3 times across at least 2 reviews of this repo. For each one, suggest a single line to the user after the report. Its `suggest` field says which kind:

- People fixed it: a rule that prevents it, as an `AGENTS.md` convention or a lint rule.
- People called it wrong, intended or not worth fixing: a `REVIEW.md` line that tells reviewers not to raise it.

Suggest only. Do not edit those files unless the user asks.

### Draft line comments

After the report, give one draft comment per new finding in **Blockers**, **Should fix** and **Pre-existing**, and one draft reply per earlier finding whose thread needs an answer. Do not draft comments for **Smaller items**. They stay in the report unless the user asks for them: an agent author fixes every nit it gets, and each fix costs another round. Use this form, with the location on the first line and the body after it:

````text
path/file.ts:42
<The problem in one sentence.> <The scenario.> <A suggested fix, if one is clear.>

```suggestion
<replacement lines, when the fix is a few lines>
```
````

Write them the way a colleague would: direct, specific, no "consider maybe". Do not start with a number or a ledger label: the comment sits on the line it is about. Start a pre-existing finding with "Pre-existing, not from this PR:", so it does not read as the author's mistake. When the finding has other `instances`, list them in the comment, so the author fixes every place at once.

### Format for GitHub

Everything posted to GitHub (line comments, thread replies, review bodies) is GitHub Markdown, written for people who have never seen the ledger:

- Put all code in backticks: identifiers, function calls, file paths, `file:line` locations, commands, flags, environment variables, config keys and literal values. Write ``the extra item comes from `page()` in `src/page.js:12` ``, not "the extra item comes from page() in src/page.js:12".
- Use a fenced block with a language (` ```ts `) for code longer than one line.
- In a line comment, when the fix is a few lines, add a ` ```suggestion ` block that holds the replacement lines, so the author can apply it in one click.
- Never write ledger IDs such as F1 or F2. They are internal keys and mean nothing to anyone else. Name a finding by what breaks and where.

Save each body to a file and check it before posting:

```sh
node <skill>/scripts/agent-review.mjs prose --github <file>
```

It fails on ledger IDs, escaped backticks, code outside backticks, unbalanced backticks, and code blocks with no language, on top of the prose rules. Fix each flag. Keep one only on purpose, such as a quoted error message, and say why.

Post the body from that file, never from a string inside the shell command. Inside a shell string, backticks get escaped as `` \` ``, and GitHub then shows a literal backtick instead of code:

- Review with line comments: write a JSON file with `commit_id`, `body` and `comments` (each with `path`, `line` and `body`), and leave out `event` so the review stays pending. Then run `gh api repos/<owner>/<repo>/pulls/<number>/reviews --method POST --input <review.json>`.
- PR comment: `gh pr comment <number> --body-file <file>`.
- Thread reply: `gh api graphql -F id=<threadId> -F body=@<file> -f query='<mutation>'`. The `@` reads the body from the file.

### Before anything leaves this machine

This skill never posts, comments, approves, merges, pushes to the default branch, or publishes on its own. Before any command or tool call that does one of those things, check the repo's rules:

```sh
node <skill>/scripts/agent-review.mjs policy check -- <the exact command>
```

- `allow`: the repo's rules permit it. Go ahead.
- `ask`: ask the user in this conversation, naming the exact action. Go ahead only after they say yes to that action.
- `deny`: do not do it. Tell the user which rule denies it.

A request earlier in the conversation to "review" something is not approval to post the review.

If the user asks you to post the comments, post them as one pending review, so they can read it before it goes out. Post replies to earlier findings in their threads, never as new comments. Check `gh api` writes with the command above first. After the review is submitted, record each new finding's thread with `ledger link`, as above, so the next round can answer in place.

## Done when

- The report starts with the round, and the draft comments are in the conversation.
- The ledger has this round, every finding, a verification decision for each, and severity and triage for each confirmed finding.
- In a follow-up, every earlier reported finding has a status in the report, a thread reply drafted when its thread needs one, and a disposition in the ledger when it is closed.
- No ledger ID appears in the report, the comments or the replies, and `prose --github` passes on everything drafted for GitHub.
- Nothing was posted unless the user approved that exact action.
