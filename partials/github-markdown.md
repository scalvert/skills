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
