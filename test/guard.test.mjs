import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRESETS, compileCodex, toCodexPrefix, writeShims } from "../shared/scalvert/scripts/permissions.mjs";
import { defaultBranchPush, evaluate, ghApiWrite, render, tauCheck } from "../shared/scalvert/scripts/guard.mjs";

const GUARD = new URL("../shared/scalvert/scripts/guard.mjs", import.meta.url).pathname;
const onMain = { branch: "main", defaultBranch: "main" };
const onTopic = { branch: "topic", defaultBranch: "main" };
const onTrunk = { branch: "trunk", defaultBranch: "trunk" };

test("default-branch pushes are caught however they are written", () => {
  assert.ok(defaultBranchPush("git push", onMain));
  assert.ok(defaultBranchPush("git push origin", onMain));
  assert.ok(defaultBranchPush("git push -u origin HEAD", onMain));
  assert.ok(defaultBranchPush("git push origin topic:main", onTopic));
  assert.ok(defaultBranchPush("git push origin +refs/heads/topic:refs/heads/main", onTopic));
  assert.ok(defaultBranchPush("git push", onTrunk));
  assert.ok(defaultBranchPush("git push origin trunk", { branch: "topic", defaultBranch: "trunk" }));
});

test("feature-branch pushes pass", () => {
  assert.equal(defaultBranchPush("git push", onTopic), null);
  assert.equal(defaultBranchPush("git push -u origin topic", onTopic), null);
  assert.equal(defaultBranchPush("git push origin HEAD", onTopic), null);
  assert.equal(defaultBranchPush("git status", onMain), null);
});

test("gh api writes are caught and reads pass", () => {
  assert.ok(ghApiWrite("gh api repos/o/r/issues/1/comments -f body=hi"));
  assert.ok(ghApiWrite("gh api -X POST repos/o/r/pulls/1/reviews"));
  assert.ok(ghApiWrite("gh api --method=PATCH repos/o/r/pulls/1"));
  assert.ok(ghApiWrite("gh api graphql -f query='mutation { resolveReviewThread(input:{}) { x } }'"));
  assert.equal(ghApiWrite("gh api repos/o/r/pulls/1"), null);
  assert.equal(ghApiWrite("gh api graphql -f query='query { viewer { login } }'"), null);
  assert.equal(ghApiWrite("gh api -X GET search/issues -f q=x"), null);
});

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });

test("claude: the guard asks only for what native rules cannot express", () => {
  const ctx = { host: "claude", state: onMain, permissions: PRESETS["draft-pr"] };
  assert.equal(evaluate(bash("npm test && git push"), ctx).decision, "ask");
  assert.equal(evaluate(bash("gh pr comment 1 --body x"), ctx), null, "native rules handle this");
  assert.equal(evaluate({ tool_name: "mcp__github__merge_pull_request" }, ctx), null, "native rules handle MCP");
  const out = render(evaluate(bash("git push"), ctx), "claude");
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
});

test("codex: the guard applies rules prefix rules cannot express, and denies instead of asking", () => {
  const ctx = { host: "codex", state: onTopic, permissions: PRESETS["draft-pr"] };
  assert.equal(evaluate(bash("git push --force-with-lease origin topic"), ctx).decision, "ask");
  assert.equal(evaluate({ tool_name: "mcp__github__add_issue_comment" }, ctx).decision, "ask");
  assert.equal(evaluate(bash("gh pr comment 1 --body x"), ctx), null, "compiled prefix rule handles this");
  assert.equal(evaluate(bash("git push -u origin topic"), ctx), null);
  const out = render(evaluate({ tool_name: "mcp__github__add_issue_comment" }, ctx), "codex");
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /explicit approval/);
});

test("tau: the shim check applies every explicit rule and ignores unmatched commands", () => {
  const ctx = { state: onTopic, permissions: PRESETS["draft-pr"] };
  assert.equal(tauCheck(["gh", "pr", "comment", "1", "--body", "x"], ctx).decision, "ask");
  assert.equal(tauCheck(["gh", "pr", "merge", "1"], ctx).decision, "ask");
  assert.equal(tauCheck(["gh", "pr", "merge", "1"], { ...ctx, permissions: PRESETS["self-merge"] }), null);
  assert.equal(tauCheck(["git", "status"], ctx), null);
  assert.equal(tauCheck(["git", "push"], { ...ctx, state: onMain }).decision, "ask");
});

test("codex compile: prefix-shaped rules become prefix rules, the rest go to the guard", () => {
  assert.deepEqual(toCodexPrefix("Bash(gh pr comment *)", "ask"), ["gh", "pr", "comment"]);
  assert.deepEqual(toCodexPrefix("Bash(npm run test:*)", "allow"), ["npm", "run", "test"]);
  assert.deepEqual(toCodexPrefix("Bash(gh pr view)", "ask"), ["gh", "pr", "view"]);
  assert.equal(toCodexPrefix("Bash(gh pr view)", "allow"), null, "exact allow would match too much");
  assert.equal(toCodexPrefix("Bash(git push * main)", "ask"), null);
  assert.equal(toCodexPrefix("mcp__github__create_*", "ask"), null);
  const { text, skipped } = compileCodex(PRESETS["draft-pr"], "test");
  assert.match(text, /prefix_rule\(pattern=\["gh","pr","merge"\], decision="prompt"/);
  assert.match(text, /prefix_rule\(pattern=\["gh","pr","create","--draft"\], decision="allow"/);
  assert.ok(skipped.includes("Bash(git push * main)"));
});

test("codex compile output is accepted by codex execpolicy", { skip: spawnSync("codex", ["--version"]).status !== 0 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-rules-"));
  const file = join(dir, "scalvert.rules");
  writeFileSync(file, compileCodex(PRESETS["draft-pr"], "test").text);
  const decide = (...cmd) =>
    JSON.parse(execFileSync("codex", ["execpolicy", "check", "--rules", file, "--", ...cmd], { encoding: "utf8" })).decision;
  assert.equal(decide("gh", "pr", "comment", "1"), "prompt");
  assert.equal(decide("gh", "pr", "merge", "1", "--squash"), "prompt");
  assert.equal(decide("gh", "pr", "create", "--draft", "--title", "x"), "allow");
  assert.equal(decide("git", "push", "-f", "origin", "x"), "prompt");
  assert.equal(decide("npm", "publish"), "prompt");
});

test("tau shim: blocks in an agent shell, passes in a person's terminal", () => {
  const dir = mkdtempSync(join(tmpdir(), "shim-"));
  const repo = join(dir, "repo");
  mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "topic"], { cwd: repo });
  // A fake gh that records that it ran.
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const marker = join(dir, "ran");
  writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "$@" >> ${JSON.stringify(marker)}\n`, { mode: 0o755 });
  const shims = join(dir, "shims");
  writeShims(shims);
  const PATH = `${shims}:${bin}:${process.env.PATH}`;
  const run = (env) => spawnSync("gh", ["pr", "comment", "1", "--body", "x"], { cwd: repo, env: { ...process.env, PATH, ...env }, encoding: "utf8" });

  const env = { ...process.env };
  delete env.PI_SESSION_ID;
  const person = spawnSync("gh", ["pr", "comment", "1"], { cwd: repo, env: { ...env, PATH }, encoding: "utf8" });
  assert.equal(person.status, 0, person.stderr);

  const agent = run({ PI_SESSION_ID: "test" });
  assert.equal(agent.status, 126);
  assert.match(agent.stderr, /needs the user's explicit approval/);

  const approved = run({ PI_SESSION_ID: "test", SCALVERT_APPROVED: "1" });
  assert.equal(approved.status, 0, approved.stderr);
  assert.equal(readFileSync(marker, "utf8").trim().split("\n").length, 2, "fake gh ran for the person and the approved call only");
});

test("hook CLI: claude asks for a bare push on main", () => {
  const repo = mkdtempSync(join(tmpdir(), "hook-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  const out = execFileSync("node", [GUARD, "--host", "claude"], {
    input: JSON.stringify({ ...bash("git push"), cwd: repo }),
    encoding: "utf8",
  });
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecision, "ask");
  const quiet = execFileSync("node", [GUARD, "--host", "claude"], {
    input: JSON.stringify({ ...bash("git status"), cwd: repo }),
    encoding: "utf8",
  });
  assert.equal(quiet, "");
});
