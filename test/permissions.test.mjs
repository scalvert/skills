import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PRESETS,
  checkCommand,
  checkTool,
  load,
  matchPattern,
  splitCommand,
  validate,
  PermissionsError,
} from "../shared/scalvert/scripts/permissions.mjs";

const SCRIPT = new URL("../shared/scalvert/scripts/permissions.mjs", import.meta.url).pathname;

// Each external action, and what each preset decides for it.
const MATRIX = [
  // command                                         local-only  draft-pr  self-merge
  ["gh pr create --draft --title x --body y",        "ask",      "allow",  "allow"],
  ["gh pr comment 12 --body hi",                     "ask",      "ask",    "ask"],
  ["gh pr review 12 --approve",                      "ask",      "ask",    "ask"],
  ["gh pr merge 12 --squash",                        "ask",      "ask",    "allow"],
  ["gh pr ready 12",                                 "ask",      "ask",    "allow"],
  ["gh issue comment 3 --body hi",                   "ask",      "ask",    "ask"],
  ["gh release create v1.0.0",                       "ask",      "ask",    "ask"],
  ["npm publish",                                    "ask",      "ask",    "ask"],
  ["git push --force-with-lease origin topic",       "ask",      "ask",    "ask"],
  ["git push -f origin topic",                       "ask",      "ask",    "ask"],
  ["git push origin main",                           "ask",      "ask",    "ask"],
  ["git push origin HEAD:main",                      "ask",      "ask",    "ask"],
  ["git push -u origin topic",                       "ask",      "allow",  "allow"],
];

const PRESET_NAMES = ["local-only", "draft-pr", "self-merge"];

for (const [command, ...expected] of MATRIX) {
  PRESET_NAMES.forEach((name, i) => {
    test(`${name}: ${command} -> ${expected[i]}`, () => {
      assert.equal(checkCommand(PRESETS[name], command).decision, expected[i]);
    });
  });
}

test("a non-draft PR is never auto-allowed", () => {
  for (const name of PRESET_NAMES) {
    assert.equal(checkCommand(PRESETS[name], "gh pr create --title x").decision, "ask", name);
  }
});

test("GitHub and Slack MCP writes ask in every preset; reads do not match", () => {
  for (const name of PRESET_NAMES) {
    for (const tool of [
      "mcp__github__create_pull_request_review",
      "mcp__github__add_issue_comment",
      "mcp__github__merge_pull_request",
      "mcp__plugin_github_github__update_pull_request",
      "mcp__slack__slack_post_message",
      "mcp__claude_ai_Slack__slack_send_message",
    ]) {
      assert.equal(checkTool(PRESETS[name], tool).decision, "ask", `${name} ${tool}`);
    }
    assert.equal(checkTool(PRESETS[name], "mcp__github__get_pull_request").rule, null);
  }
});

test("ask applies when any subcommand matches, including nested ones", () => {
  const p = PRESETS["self-merge"];
  assert.equal(checkCommand(p, "npm test && gh pr comment 1 --body ok").decision, "ask");
  assert.equal(checkCommand(p, 'echo "$(gh pr review 1 --approve)"').decision, "ask");
  assert.equal(checkCommand(p, "timeout 30 npm publish").decision, "ask");
  assert.equal(checkCommand(p, "FOO=bar gh release create v1").decision, "ask");
});

test("allow must match every subcommand", () => {
  const p = { allow: ["Bash(gh pr merge *)"], ask: [], deny: [] };
  assert.equal(checkCommand(p, "gh pr merge 1").decision, "allow");
  assert.equal(checkCommand(p, "gh pr merge 1 && rm -rf x").decision, "ask");
  assert.equal(checkCommand(p, "SECRET=1 gh pr merge 1").decision, "ask");
  assert.equal(checkCommand(p, "NODE_ENV=ci gh pr merge 1").decision, "allow");
});

test("deny beats ask beats allow, regardless of specificity", () => {
  const p = { allow: ["Bash(gh pr merge 1)"], ask: ["Bash(gh pr *)"], deny: ["Bash(gh pr merge *)"] };
  assert.equal(checkCommand(p, "gh pr merge 1").decision, "deny");
  assert.equal(checkCommand(p, "gh pr view 1").decision, "ask");
});

test("pattern matching follows Claude Code's rules", () => {
  assert.ok(matchPattern("ls *", "ls"));
  assert.ok(matchPattern("ls *", "ls -la"));
  assert.ok(!matchPattern("ls *", "lsof"));
  assert.ok(matchPattern("ls*", "lsof"));
  assert.ok(matchPattern("ls:*", "ls -la"));
  assert.ok(matchPattern("git push * main", "git push origin main"));
  assert.ok(!matchPattern("git push * main", "git push origin main-fix"));
  assert.ok(matchPattern("gh pr view", "gh pr view"));
  assert.ok(!matchPattern("gh pr view", "gh pr view 1"));
});

test("splitting respects quotes", () => {
  assert.deepEqual(splitCommand('git commit -m "a && b" && git push'), ['git commit -m "a && b"', "git push"]);
  assert.deepEqual(splitCommand("a | b; c || d & e"), ["a", "b", "c", "d", "e"]);
});

test("unmatched commands ask", () => {
  assert.equal(checkCommand(PRESETS["draft-pr"], "curl -X POST https://example.com").decision, "ask");
});

function repo(settings) {
  const dir = mkdtempSync(join(tmpdir(), "perm-"));
  if (settings !== undefined) {
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude", "settings.json"), typeof settings === "string" ? settings : JSON.stringify(settings));
  }
  return join(dir, ".claude", "settings.json");
}

test("a repo with no settings file gets draft-pr", () => {
  const { permissions, source } = load(repo());
  assert.deepEqual(permissions, PRESETS["draft-pr"]);
  assert.match(source, /preset:draft-pr/);
});

test("a settings file with no permissions block gets draft-pr", () => {
  const { permissions } = load(repo({ env: {} }));
  assert.deepEqual(permissions, PRESETS["draft-pr"]);
});

test("a repo's own rules are used as written", () => {
  const { permissions } = load(repo({ permissions: { allow: ["Bash(gh pr merge *)"] } }));
  assert.equal(checkCommand(permissions, "gh pr merge 1").decision, "allow");
});

test("invalid settings are rejected", () => {
  assert.throws(() => load(repo("{not json")), PermissionsError);
  assert.throws(() => validate([]), PermissionsError);
  assert.throws(() => validate({ ask: "Bash(x)" }), PermissionsError);
  assert.throws(() => validate({ deny: [""] }), PermissionsError);
  assert.throws(() => validate({ allow: ["Bash(unclosed"] }), PermissionsError);
});

test("CLI: check, preset and lint", () => {
  const settings = repo({ permissions: { allow: ["Bash(gh pr merge *)"] } });
  const run = (...args) => execFileSync("node", [SCRIPT, ...args], { encoding: "utf8" }).trim();
  assert.equal(run("check", "--settings", settings, "--", "gh", "pr", "merge", "1"), "allow");
  assert.equal(JSON.parse(run("check", "--settings", settings, "--json", "--", "gh pr comment 1")).decision, "ask");
  assert.equal(run("check", "--settings", settings, "--tool", "mcp__github__merge_pull_request"), "ask");
  assert.deepEqual(JSON.parse(run("preset", "self-merge")).permissions, PRESETS["self-merge"]);
  assert.match(run("lint", "--settings", settings), /^ok:/);
  assert.throws(() => execFileSync("node", [SCRIPT, "lint", "--settings", repo("{bad")], { stdio: "pipe" }));
});

// The same fixtures live in gleanwork/configure-agents (test/fixtures), which
// scaffolds these presets and compiles the same Codex rules. Change both.
test("presets and compiled Codex rules match the contract shared with configure-agents", async () => {
  const { readFileSync } = await import("node:fs");
  const { compileCodex } = await import("../shared/scalvert/scripts/permissions.mjs");
  const presets = JSON.parse(readFileSync(new URL("./presets.fixture.json", import.meta.url), "utf8"));
  assert.deepEqual(PRESETS, presets);
  const rules = readFileSync(new URL("./draft-pr.rules.fixture", import.meta.url), "utf8");
  assert.equal(compileCodex(PRESETS["draft-pr"], "x").text, rules);
});
