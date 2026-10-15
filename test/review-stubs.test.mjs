// PR-mode pinning (F2) and the cross-model lens runners (F5), against stub
// gh, codex and claude executables on PATH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPTS = new URL("../shared/scalvert/scripts/", import.meta.url).pathname;

function stub(dir, name, body) {
  const file = join(dir, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

test("pin --pr: fetches the PR head, diffs against the base, and writes the spec (F2)", () => {
  const root = mkdtempSync(join(tmpdir(), "pinpr-"));
  const origin = join(root, "origin.git");
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  mkdirSync(bin);
  const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "-q", origin, repo]);
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "t");
  writeFileSync(join(repo, "REVIEW.md"), "# Rules\n");
  writeFileSync(join(repo, "a.js"), "1\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  git(repo, "push", "-q", "origin", "main");
  git(repo, "checkout", "-q", "-b", "feature");
  writeFileSync(join(repo, "a.js"), "2\n");
  git(repo, "commit", "-qam", "change a");
  const head = git(repo, "rev-parse", "HEAD");
  git(repo, "push", "-q", "origin", "HEAD:refs/pull/7/head");
  git(repo, "checkout", "-q", "main");
  git(repo, "branch", "-D", "feature");

  const pr = { number: 7, title: "Change a", body: "Set a to 2.", url: "https://example.com/pr/7", baseRefName: "main", headRefOid: head, closingIssuesReferences: [] };
  stub(bin, "gh", `case "$1 $2" in "pr view") echo '${JSON.stringify(pr)}' ;; *) exit 1 ;; esac`);
  const out = execFileSync("node", [join(SCRIPTS, "agent-review.mjs"), "pin", "--pr", "7", "--out", join(root, "ctx")], {
    cwd: repo,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: "utf8",
  });
  const ctx = JSON.parse(out);
  assert.equal(ctx.key, "7");
  assert.equal(ctx.head, head);
  assert.equal(ctx.files, 1);
  assert.equal(ctx.has.spec, true);
  assert.match(readFileSync(join(root, "ctx", "spec.md"), "utf8"), /# Change a[\s\S]*Set a to 2\./);
  assert.match(readFileSync(join(root, "ctx", "diff.patch"), "utf8"), /^\+2$/m);
});

test("run-lens: runs Codex and Claude, tags each finding, and fails loudly on bad output (F5)", () => {
  const root = mkdtempSync(join(tmpdir(), "lens-"));
  const bin = join(root, "bin");
  const ctx = join(root, "ctx");
  mkdirSync(bin);
  mkdirSync(ctx);
  writeFileSync(join(ctx, "diff.patch"), "+x\n");
  const finding = { file: "a.js", line: 1, title: "t", precondition: "p", scenario: "s", evidence: "e", axiom: null };
  // codex writes its final message to the file after -o.
  stub(bin, "codex", `while [ "$#" -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; fi; shift; done\ncat > /dev/null\necho '${JSON.stringify({ findings: [finding] })}' > "$out"`);
  stub(bin, "claude", `echo '${JSON.stringify({ result: "Here you go:\\n" + JSON.stringify({ findings: [finding] }) })}'`);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const run = (...a) => JSON.parse(execFileSync("node", [join(SCRIPTS, "agent-review.mjs"), "lens", "run", ...a], { cwd: root, env, encoding: "utf8" }));

  const viaCodex = run("correctness", "--via", "codex", "--context", ctx, "--model", "gpt-x");
  assert.deepEqual(viaCodex, [{ ...finding, lens: "correctness", model: "openai/gpt-x" }]);
  const viaClaude = run("tests", "--via", "claude", "--context", ctx);
  assert.equal(viaClaude[0].model, "anthropic/claude-default");
  assert.equal(viaClaude[0].lens, "tests");

  stub(bin, "claude", "echo '{\"result\": \"I could not review this.\"}'");
  assert.throws(
    () => execFileSync("node", [join(SCRIPTS, "agent-review.mjs"), "lens", "run", "tests", "--via", "claude", "--context", ctx], { cwd: root, env, stdio: "pipe" }),
    /no JSON object/,
  );
});
