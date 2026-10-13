// Tests for the fixes from the first real review of these skills (PR 3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify } from "../shared/scalvert/scripts/classify.mjs";
import * as ledger from "../shared/scalvert/scripts/review-ledger.mjs";
import { pin } from "../shared/scalvert/scripts/review-context.mjs";

process.env.SCALVERT_STATE_DIR = mkdtempSync(join(tmpdir(), "scalvert-state-"));

const finding = (over = {}) => ({
  lens: "correctness",
  model: "anthropic/claude-x",
  file: "src/a.ts",
  line: 10,
  title: "t",
  precondition: "p",
  scenario: "s",
  ...over,
});

test("ledger keys: distinct branch names never share a file (F15)", () => {
  assert.notEqual(ledger.keyFile("a/b"), ledger.keyFile("a_b"));
  assert.equal(ledger.keyFile("feature/x"), "feature%2Fx");
  assert.equal(ledger.keyFile("12"), "12");
});

test("ledger: open findings carry across rounds until closed; report covers only the latest round (F4, F9)", () => {
  const l = ledger.load("o/r", "rounds");
  ledger.startRound(l, { base: "b", head: "h1", lenses: ["correctness"] });
  ledger.recordRun(l, { lens: "correctness", model: "anthropic/x" });
  ledger.addFindings(l, [finding({ title: "one" }), finding({ title: "two" })]);
  for (const id of ["F1", "F2"]) ledger.decide(l, id, "finding-verification", { label: "confirmed", probability: 0.9 });
  ledger.report(l);
  ledger.startRound(l, { base: "b", head: "h2", lenses: ["correctness"] });
  ledger.recordRun(l, { lens: "correctness", model: "anthropic/x" });
  ledger.dispose(l, "F1", "fixed");
  assert.deepEqual(ledger.report(l).findings, [], "round 2 reports only round 2 findings");
  ledger.startRound(l, { base: "b", head: "h3", lenses: ["correctness"] });
  assert.deepEqual(ledger.openFindings(l).map((f) => f.id), ["F2"], "still open in round 3");
});

test("ledger: merging a primary re-parents its duplicates (F3)", () => {
  const l = ledger.load("o/r", "reparent");
  ledger.startRound(l, { base: "b", head: "h", lenses: [] });
  ledger.addFindings(l, [finding(), finding(), finding()]);
  ledger.mergeFindings(l, "F2", ["F3"]);
  ledger.mergeFindings(l, "F1", ["F2"]);
  assert.deepEqual(l.findings.map((f) => f.duplicateOf ?? null), [null, "F1", "F1"]);
});

test("classify(): the agent backend validates the decision the agent made (F8)", () => {
  assert.equal(classify("finding-severity", { id: "F1" }, { decision: { label: "nit", probability: 0.6 } }).label, "nit");
  assert.throws(() => classify("finding-severity", {}, {}), /needs the agent/);
  assert.throws(() => classify("finding-severity", {}, { backend: "ollama", decision: {} }), /not available yet/);
});

test("pin: rules come from the base, renamed generated files stay skipped, --since must be an ancestor (F17, F1, F12)", () => {
  const repo = mkdtempSync(join(tmpdir(), "pin2-"));
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(repo, "REVIEW.md"), "# Base rules\n");
  writeFileSync(join(repo, ".gitattributes"), "gen/** linguist-generated=true\n");
  mkdirSync(join(repo, "gen"));
  writeFileSync(join(repo, "gen", "old.js"), "x\n".repeat(20));
  writeFileSync(join(repo, "a.js"), "1\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "topic");
  writeFileSync(join(repo, "REVIEW.md"), "# Rules rewritten by the PR\n");
  git("mv", "gen/old.js", "gen/new.js");
  writeFileSync(join(repo, "a.js"), "2\n");
  git("commit", "-qam", "change");
  const cwd = process.cwd();
  try {
    process.chdir(repo);
    const ctx = pin({ base: "main", out: join(repo, ".ctx") });
    assert.equal(readFileSync(join(ctx.dir, "REVIEW.md"), "utf8"), "# Base rules\n");
    assert.deepEqual(ctx.rulesChanged, ["REVIEW.md"]);
    assert.ok(!readFileSync(join(ctx.dir, "diff.patch"), "utf8").includes("gen/"), "renamed generated file is skipped");
    assert.equal(ctx.generatedSkipped, 2);
    git("checkout", "-q", "-b", "other", "main");
    writeFileSync(join(repo, "a.js"), "3\n");
    git("commit", "-qam", "unrelated");
    const unrelated = git("rev-parse", "HEAD").trim();
    git("checkout", "-q", "topic");
    assert.throws(() => pin({ base: "main", since: unrelated, out: join(repo, ".ctx2") }), /not an ancestor/);
  } finally {
    process.chdir(cwd);
  }
});
