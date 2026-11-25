import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";

import { findSessions } from "../shared/scalvert/skills/find-past-session/scripts/find-session.mjs";

const SCRIPT = "shared/scalvert/skills/find-past-session/scripts/find-session.mjs";
const NOW = Date.parse("2026-06-30T00:00:00Z");

let home;

/** Writes one JSON Lines file under the temporary home folder. */
function writeJsonl(path, lines) {
  const file = join(home, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
}

before(() => {
  home = mkdtempSync(join(tmpdir(), "find-session-"));

  writeJsonl(".claude/projects/-work-site/aaa.jsonl", [
    { type: "user", cwd: "/work/site", timestamp: "2026-06-20T10:00:00Z", message: { content: "Fix the header letter spacing on the homepage" } },
    { type: "user", cwd: "/work/site", timestamp: "2026-06-20T10:01:00Z", toolUseResult: {}, message: { content: [{ type: "text", text: "letter spacing tool output" }] } },
    { type: "user", cwd: "/work/site", timestamp: "2026-06-20T10:02:00Z", message: { content: "<system-reminder>letter spacing</system-reminder>" } },
  ]);
  writeJsonl(".claude/projects/-work-site/aaa/subagents/bbb.jsonl", [
    { type: "user", cwd: "/work/site", timestamp: "2026-06-20T10:03:00Z", message: { content: "Subagent task about letter spacing" } },
  ]);
  writeJsonl(".claude/history.jsonl", [
    { display: "Fix the header letter spacing on the homepage", timestamp: Date.parse("2026-06-20T10:00:00Z"), project: "/work/site" },
    { display: "Set up trusted publishing for the release workflow", timestamp: Date.parse("2026-05-01T09:00:00Z"), project: "/work/cli" },
    { display: "/clear", timestamp: Date.parse("2026-05-01T09:01:00Z"), project: "/work/cli" },
  ]);
  writeJsonl(".codex/sessions/2026/06/25/rollout-1.jsonl", [
    { type: "session_meta", payload: { id: "codex-1", cwd: "/work/cli", timestamp: "2026-06-25T08:00:00Z", source: "cli" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>release</environment_context>" }] } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Cut a release candidate and check the changelog labels" }] } },
  ]);
  writeJsonl(".codex/sessions/2026/06/25/rollout-2.jsonl", [
    { type: "session_meta", payload: { id: "codex-2", cwd: "/work/cli", timestamp: "2026-06-25T08:05:00Z", source: { subagent: { other: "review" } } } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Review the release candidate changelog" }] } },
  ]);
  writeJsonl(".cursor/projects/work-app/agent-transcripts/ccc/ccc.jsonl", [
    { role: "user", message: { content: [{ type: "text", text: "<timestamp>today</timestamp>\n<user_query>\nWhy is the release build failing?\n</user_query>" }] } },
  ]);
});

after(() => rmSync(home, { recursive: true, force: true }));

test("finds a prompt in a Claude Code transcript and gives the reopen command", () => {
  const { matches } = findSessions({ terms: ["letter", "spacing"], home, now: NOW });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].tool, "claude-code");
  assert.equal(matches[0].cwd, "/work/site");
  assert.equal(matches[0].reopen, "cd /work/site && claude --resume aaa");
});

test("skips tool output, injected text, subagent sessions and repeated history", () => {
  const { total } = findSessions({ terms: ["letter spacing"], home, now: NOW });
  assert.equal(total, 1);
});

test("finds a prompt that only the prompt history still holds", () => {
  const { matches } = findSessions({ terms: ["trusted publishing"], home, now: NOW });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].tool, "claude-code history");
  assert.equal(matches[0].reopen, null);
});

test("searches Codex and Cursor, newest first, and skips Codex subagents", () => {
  const { matches } = findSessions({ terms: ["release"], home, now: NOW });
  assert.deepEqual(
    matches.map((match) => match.tool),
    ["cursor", "codex", "claude-code history"],
  );
  assert.equal(matches[1].reopen, "codex resume codex-1");
  assert.match(matches[0].line, /^Why is the release build failing\?$/);
});

test("requires every word unless --any is set", () => {
  assert.equal(findSessions({ terms: ["release", "homepage"], home, now: NOW }).total, 0);
  assert.equal(findSessions({ terms: ["release", "homepage"], any: true, home, now: NOW }).total, 4);
});

test("filters by folder and by age", () => {
  assert.equal(findSessions({ terms: ["release"], repo: "cli", home, now: NOW }).total, 2);
  assert.deepEqual(
    findSessions({ terms: ["release"], days: 30, home, now: NOW }).matches.map((match) => match.tool),
    ["cursor", "codex"],
  );
});

test("reports coverage for each tool", () => {
  const { coverage } = findSessions({ terms: ["nothing-matches-this"], home, now: NOW });
  assert.equal(coverage["claude-code"].sessions, 1);
  assert.equal(coverage.codex.sessions, 1);
  assert.equal(coverage.cursor.sessions, 1);
  assert.equal(coverage["claude-code history"].prompts, 2);
});

test("the command prints matches and exits 2 with no words", () => {
  const out = execFileSync(process.execPath, [SCRIPT, "changelog", "labels", "--home", home], { encoding: "utf8" });
  assert.match(out, /codex resume codex-1/);
  assert.match(out, /1 of 1 matching sessions shown\./);
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, "--home", home], { stdio: "pipe" }), /usage/);
});

/** Builds a separate home folder from a map of relative path to JSON lines. */
function makeHome(files) {
  const dir = mkdtempSync(join(tmpdir(), "find-session-"));
  for (const [path, lines] of Object.entries(files)) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  }
  return dir;
}

test("skips a Claude Code compact summary but still finds typed prompts", (t) => {
  const dir = makeHome({
    ".claude/projects/-work-app/ddd.jsonl": [
      { type: "user", cwd: "/work/app", timestamp: "2026-06-20T10:00:00Z", message: { content: "Add a dark mode toggle" } },
      {
        type: "user",
        cwd: "/work/app",
        timestamp: "2026-06-20T11:00:00Z",
        isCompactSummary: true,
        message: { content: "This session is being continued from a previous conversation. Files and Code Sections: theme.css" },
      },
    ],
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(findSessions({ terms: ["Files and Code Sections"], home: dir, now: NOW }).total, 0);
  assert.equal(findSessions({ terms: ["dark mode"], home: dir, now: NOW }).total, 1);
});

test("quotes the folder and ID in the reopen command so the shell keeps them literal", (t) => {
  const folders = ["/Users/me/My Project", "/tmp/it's here", "/tmp/$(printf injected)", "/tmp/`printf injected`"];
  const dir = makeHome(
    Object.fromEntries(
      folders.map((cwd, index) => [
        `.claude/projects/p${index}/id-${index}.jsonl`,
        [{ type: "user", cwd, timestamp: "2026-06-20T10:00:00Z", message: { content: `quoting check ${index}` } }],
      ]),
    ),
  );
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { matches } = findSessions({ terms: ["quoting check"], home: dir, now: NOW });
  assert.equal(matches.length, folders.length);
  for (const match of matches) {
    // Swap the commands for printf, so the shell shows the arguments it parsed.
    const script = match.reopen.replace(/^cd /, "printf '%s\\n' ").replace(" && claude --resume ", " ");
    const args = execFileSync("/bin/sh", ["-c", script], { cwd: dir, encoding: "utf8" }).split("\n").slice(0, -1);
    assert.deepEqual(args, [match.cwd, match.id]);
  }
});

test("drops every history entry whose transcript exists, even an old one", (t) => {
  const dir = makeHome({
    ".claude/projects/-work-cli/eee.jsonl": [
      { type: "user", cwd: "/work/cli", timestamp: "2026-06-01T10:00:00Z", message: { content: "cut a release" } },
      { type: "user", cwd: "/work/cli", timestamp: "2026-06-29T10:00:00Z", message: { content: "redo the release notes" } },
    ],
    ".claude/history.jsonl": [
      { display: "cut a release", timestamp: Date.parse("2026-06-01T10:00:00Z"), project: "/work/cli", sessionId: "eee" },
      { display: "redo the release notes", timestamp: Date.parse("2026-06-29T10:00:00Z"), project: "/work/cli", sessionId: "eee" },
      { display: "release from another folder", timestamp: Date.parse("2026-06-29T11:00:00Z"), project: "/work/other" },
    ],
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const all = findSessions({ terms: ["release"], home: dir, now: NOW });
  assert.deepEqual(
    all.matches.map((match) => [match.tool, match.cwd]),
    [
      ["claude-code history", "/work/other"],
      ["claude-code", "/work/cli"],
    ],
  );
  const recent = findSessions({ terms: ["release"], days: 7, home: dir, now: NOW });
  assert.deepEqual(
    recent.matches.map((match) => [match.tool, match.cwd]),
    [["claude-code history", "/work/other"]],
  );
});
