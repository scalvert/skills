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

test("pin on a branch: uses the open PR's description as the spec, and nothing otherwise", () => {
  const root = mkdtempSync(join(tmpdir(), "pinbranch-"));
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  mkdirSync(bin);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" }).trim();
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(repo, "a.js"), "1\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "feature");
  writeFileSync(join(repo, "a.js"), "2\n");
  git("commit", "-qam", "change a");

  const pin = (state) => {
    const pr = { number: 9, title: "Change a", body: "Set a to 2.", url: "https://example.com/pr/9", state, closingIssuesReferences: [] };
    stub(bin, "gh", state ? `case "$1 $2" in "pr view") echo '${JSON.stringify(pr)}' ;; *) exit 1 ;; esac` : "exit 1");
    const out = join(root, `ctx-${state ?? "none"}`);
    const ctx = JSON.parse(
      execFileSync("node", [join(SCRIPTS, "agent-review.mjs"), "pin", "--base", "main", "--out", out], {
        cwd: repo,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        encoding: "utf8",
      }),
    );
    return { ctx, out };
  };
  const open = pin("OPEN");
  assert.equal(open.ctx.key, "feature");
  assert.equal(open.ctx.has.spec, true);
  assert.match(readFileSync(join(open.out, "spec.md"), "utf8"), /# Change a[\s\S]*Set a to 2\./);
  assert.equal(pin("MERGED").ctx.has.spec, false, "a merged PR is not this branch's intent any more");
  assert.equal(pin(null).ctx.has.spec, false, "no gh or no PR leaves the spec empty");
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

  // The plan's provider/model IDs reach each CLI as its own name, and the
  // recorded model keeps one provider prefix.
  const seen = join(root, "seen");
  stub(bin, "codex", `while [ "$#" -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; fi; if [ "$1" = "-m" ]; then echo "$2" >> "${seen}"; fi; shift; done\ncat > /dev/null\necho '${JSON.stringify({ findings: [finding] })}' > "$out"`);
  stub(bin, "claude", `while [ "$#" -gt 0 ]; do if [ "$1" = "--model" ]; then echo "$2" >> "${seen}"; fi; shift; done\necho '${JSON.stringify({ result: JSON.stringify({ findings: [finding] }) })}'`);
  assert.equal(run("correctness", "--via", "codex", "--context", ctx, "--model", "openai/gpt-5.5")[0].model, "openai/gpt-5.5");
  assert.equal(run("tests", "--via", "claude", "--context", ctx, "--model", "anthropic/opus")[0].model, "anthropic/opus");
  assert.deepEqual(readFileSync(seen, "utf8").trim().split("\n"), ["gpt-5.5", "opus"]);

  stub(bin, "claude", "echo '{\"result\": \"I could not review this.\"}'");
  assert.throws(
    () => execFileSync("node", [join(SCRIPTS, "agent-review.mjs"), "lens", "run", "tests", "--via", "claude", "--context", ctx], { cwd: root, env, stdio: "pipe" }),
    /no JSON object/,
  );
});
