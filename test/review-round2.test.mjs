// Tests for the findings from the second review round of these skills (PR 3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ledger from "../cli/src/review-ledger.mjs";
import { generatedPaths } from "../cli/src/review-context.mjs";

const SCRIPTS = new URL("../shared/scalvert/scripts/", import.meta.url).pathname;
process.env.AGENT_REVIEWS_STATE_DIR = mkdtempSync(join(tmpdir(), "scalvert-state-"));

const finding = (over = {}) => ({ lens: "correctness", model: "anthropic/x", file: "a.js", line: 1, title: "t", precondition: "p", scenario: "s", ...over });

function stub(dir, name, body) {
  const file = join(dir, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

test("open findings: fixed, wont-fix and dismissed close; accepted stays open; duplicates never count (F20)", () => {
  const l = ledger.load("o/r", "open");
  ledger.startRound(l, { base: "b", head: "h", lenses: ["correctness"] });
  ledger.recordRun(l, { lens: "correctness", model: "anthropic/x" });
  ledger.addFindings(l, [finding(), finding(), finding(), finding(), finding(), finding()]);
  ledger.mergeFindings(l, "F5", ["F6"]);
  for (const id of ["F1", "F2", "F3", "F4", "F5"]) ledger.decide(l, id, "finding-verification", { label: "confirmed", probability: 0.9 });
  ledger.report(l);
  ledger.dispose(l, "F1", "fixed");
  ledger.dispose(l, "F2", "wont-fix", "by design");
  ledger.dispose(l, "F3", "dismissed");
  ledger.dispose(l, "F4", "accepted");
  assert.deepEqual(ledger.openFindings(l).map((f) => f.id), ["F4", "F5"]);
  ledger.save(l);
  const out = JSON.parse(execFileSync("node", [join(SCRIPTS, "agent-review.mjs"), "ledger", "open", "--repo", "o/r", "--key", "open"], { encoding: "utf8" }));
  assert.deepEqual(out.map((f) => f.id), ["F4", "F5"]);
});

test("generated paths fall back to the working tree on git without check-attr --source (F22)", () => {
  const repo = mkdtempSync(join(tmpdir(), "attr-"));
  const bin = mkdtempSync(join(tmpdir(), "oldgit-"));
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  // A git that rejects --source, as git before 2.40 does.
  stub(bin, "git", `for a in "$@"; do [ "$a" = "--source" ] && { echo "error: unknown option source" >&2; exit 129; }; done\nexec ${realGit} "$@"`);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  writeFileSync(join(repo, ".gitattributes"), "gen/** linguist-generated=true\n");
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    const set = generatedPaths(["gen/a.js", "src/a.js"], "HEAD", { cwd: repo });
    assert.deepEqual([...set], ["gen/a.js"]);
  } finally {
    process.env.PATH = path;
  }
});

test("review-threads list and owner work against gh and git (F23, F27, F28)", () => {
  const root = mkdtempSync(join(tmpdir(), "threads-"));
  const bin = join(root, "bin");
  const repo = join(root, "repo");
  mkdirSync(bin);
  mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(repo, "a.js"), "one\ntwo\n");
  git("add", "-A");
  git("commit", "-q", "-m", "add a");
  const sha = git("rev-parse", "HEAD");
  const page = {
    data: {
      repository: {
        pullRequest: {
          headRefName: "topic",
          threads: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: "T1", isResolved: false, isOutdated: true, path: "a.js", line: null, originalLine: 2,
                comments: { pageInfo: { hasNextPage: true }, nodes: [{ id: "c1", databaseId: 1, author: { login: "rev" }, body: "b", url: "u", createdAt: "2026-01-01" }] },
              },
            ],
          },
        },
      },
    },
  };
  stub(bin, "gh", [
    'case "$1 $2" in',
    `  "api graphql") echo '${JSON.stringify(page)}' ;;`,
    `  "pr list") echo '[{"number": 4, "headRefName": "topic", "baseRefName": "main", "title": "t"}]' ;;`,
    '  "repo view") echo "o/r" ;;',
    "  *) exit 1 ;;",
    "esac",
  ].join("\n"));
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const run = (...a) => spawnSync("node", [join(SCRIPTS, "agent-review.mjs"), "threads", ...a], { cwd: repo, env, encoding: "utf8" });

  const listRun = run("list", "--pr", "4");
  assert.equal(listRun.status, 0, listRun.stderr);
  const listed = JSON.parse(listRun.stdout);
  assert.equal(listed[0].line, null, "an outdated thread has no current line");
  assert.equal(listed[0].originalLine, 2);
  assert.equal(listed[0].commentsTruncated, true);

  const ownerRun = run("owner", "--path", "a.js", "--line", "2");
  assert.equal(ownerRun.status, 0, ownerRun.stderr);
  const owned = JSON.parse(ownerRun.stdout);
  assert.equal(owned.sha, sha);
  assert.equal(owned.prs[0].number, 4);

  const outdated = run("owner", "--path", "a.js", "--line", "null");
  assert.equal(outdated.status, 2);
  assert.match(outdated.stderr, /outdated thread/);
});

test("prose CLI: exit codes, stdin and --json (F24)", () => {
  const cli = join(SCRIPTS, "agent-review.mjs");
  const dir = mkdtempSync(join(tmpdir(), "prose-"));
  const bad = join(dir, "bad.md");
  writeFileSync(bad, "A pivotal change \u2014 truly.\n");
  const r1 = spawnSync("node", [cli, "prose", bad], { encoding: "utf8" });
  assert.equal(r1.status, 1);
  assert.match(r1.stdout, /bad\.md:1: em dash/);
  const r2 = spawnSync("node", [cli, "prose"], { input: "Plain words.\n", encoding: "utf8" });
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /prose: OK/);
  const r3 = spawnSync("node", [cli, "prose", "--json", bad], { encoding: "utf8" });
  assert.equal(r3.status, 1);
  assert.deepEqual(JSON.parse(r3.stdout).map((f) => f.rule).sort(), ["em dash", 'phrase "pivotal"']);
});
