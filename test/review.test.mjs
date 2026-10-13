import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, ClassifyError, KINDS } from "../shared/scalvert/scripts/classify.mjs";
import * as ledger from "../shared/scalvert/scripts/review-ledger.mjs";
import { chooseLenses, parseNumstat, pin } from "../shared/scalvert/scripts/review-context.mjs";
import { FINDING_SCHEMA, lensPrompt, parseFindings } from "../shared/scalvert/scripts/run-lens.mjs";

const LEDGER = new URL("../shared/scalvert/scripts/review-ledger.mjs", import.meta.url).pathname;
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

test("classify accepts valid decisions and rejects bad labels, probabilities and kinds", () => {
  assert.deepEqual(check("finding-triage", { label: "agent-fixable", probability: 0.9 }), {
    kind: "finding-triage",
    label: "agent-fixable",
    probability: 0.9,
    backend: "agent",
  });
  assert.throws(() => check("finding-triage", { label: "maybe", probability: 0.5 }), ClassifyError);
  assert.throws(() => check("finding-triage", { label: "agent-fixable", probability: 1.5 }), ClassifyError);
  assert.throws(() => check("nope", { label: "x", probability: 0 }), ClassifyError);
  assert.throws(() => check("finding-triage", { label: "agent-fixable", probability: 0.5, backend: "jev" }), ClassifyError);
  for (const spec of Object.values(KINDS)) assert.ok(spec.rubric.length > 40);
});

test("ledger: report keeps confirmed findings above the threshold, sorted by severity", () => {
  const l = ledger.load("o/r", "1");
  ledger.startRound(l, { base: "b", head: "h1", lenses: ["correctness"] });
  ledger.addFindings(l, [
    finding({ title: "nit one", file: "z.ts" }),
    finding({ title: "blocker", file: "b.ts" }),
    finding({ title: "low confidence" }),
    finding({ title: "refuted" }),
  ]);
  const v = (id, label, probability) => ledger.decide(l, id, "finding-verification", { label, probability });
  v("F1", "confirmed", 0.9);
  v("F2", "confirmed", 0.8);
  v("F3", "confirmed", 0.5);
  v("F4", "refuted", 0.95);
  ledger.decide(l, "F1", "finding-severity", { label: "nit", probability: 0.8 });
  ledger.decide(l, "F2", "finding-severity", { label: "blocker", probability: 0.9 });
  assert.throws(() => ledger.report(l), /no recorded run for lens\(es\) correctness/);
  ledger.recordRun(l, { lens: "correctness", model: "anthropic/claude-x", findings: 4 });
  const r = ledger.report(l);
  assert.deepEqual(r.findings.map((f) => f.id), ["F2", "F1"]);
  assert.deepEqual(r.dropped, ["F3", "F4"]);
  assert.equal(l.findings.find((f) => f.id === "F2").reported, true);
  assert.equal(ledger.report(l, 0.4).findings.length, 3);
});

test("ledger: findings need the fields the gate asks for", () => {
  const l = ledger.load("o/r", "gate");
  ledger.startRound(l, { base: "b", head: "h" });
  assert.throws(() => ledger.addFindings(l, [{ lens: "x", file: "a", title: "t" }]), /precondition, scenario/);
  assert.throws(() => ledger.addFindings(ledger.load("o/r", "none"), [finding()]), /start a round/);
});

test("ledger: duplicates merge into one reported finding that records who found it", () => {
  const l = ledger.load("o/r", "dupes");
  ledger.startRound(l, { base: "b", head: "h", lenses: ["correctness", "tests"] });
  ledger.recordRun(l, { lens: "correctness", model: "openai/x" });
  ledger.recordRun(l, { lens: "tests", model: "anthropic/y" });
  ledger.addFindings(l, [
    finding({ model: "openai/x" }),
    finding({ lens: "tests", model: "anthropic/y" }),
    finding({ title: "different bug" }),
  ]);
  assert.deepEqual(ledger.mergeFindings(l, "F1", ["F2"]), { reviewers: 2, lenses: ["correctness", "tests"], families: ["anthropic", "openai"] });
  assert.throws(() => ledger.mergeFindings(l, "F2", ["F3"]), /itself a duplicate/);
  ledger.decide(l, "F1", "finding-verification", { label: "confirmed", probability: 0.9 });
  ledger.decide(l, "F3", "finding-verification", { label: "confirmed", probability: 0.9 });
  const r = ledger.report(l);
  assert.deepEqual(r.findings.map((f) => f.id), ["F1", "F3"], "the duplicate needs no verification and is not reported");
  assert.equal(r.findings[0].foundBy.reviewers, 2);
  assert.deepEqual(r.merged, ["F2"]);
});

test("ledger: rejects malformed lens and model values", () => {
  const l = ledger.load("o/r", "strict");
  ledger.startRound(l, { base: "b", head: "h", lenses: ["correctness"] });
  assert.throws(() => ledger.recordRun(l, { lens: "correctness anthropic/x 0", model: "anthropic/x" }), /one lens name/);
  assert.throws(() => ledger.recordRun(l, { lens: "correctness", model: true }), /provider\/model-id/);
  assert.throws(() => ledger.recordRun(l, { lens: "security", model: "anthropic/x" }), /not in this round/);
  assert.throws(() => ledger.addFindings(l, [finding({ model: "sonnet" })]), /provider\/model-id/);
  ledger.recordRun(l, { lens: "correctness", model: "anthropic/claude-sonnet-5-5" });
  ledger.addFindings(l, [finding()]);
  assert.throws(() => ledger.decide(l, "F1", "finding-verification", { label: "confirmed", probability: 0.8, model: "true" }), /provider\/model-id/);
});

test("ledger: report refuses unverified findings", () => {
  const l = ledger.load("o/r", "unverified");
  ledger.startRound(l, { base: "b", head: "h", lenses: ["correctness"] });
  ledger.recordRun(l, { lens: "correctness", model: "anthropic/x" });
  ledger.addFindings(l, [finding()]);
  assert.throws(() => ledger.report(l), /no verification decision/);
  assert.equal(ledger.report(l, 0.7, { allowMissing: true }).findings.length, 0);
});

test("ledger: IDs stay stable across rounds and dispositions feed the summary", () => {
  const l = ledger.load("o/r", "2");
  ledger.startRound(l, { base: "b", head: "h1", lenses: ["correctness"] });
  ledger.addFindings(l, [finding(), finding({ model: "openai/gpt-x" })]);
  ledger.recordRun(l, { lens: "correctness", model: "anthropic/claude-x", findings: 1 });
  ledger.decide(l, "F1", "finding-verification", { label: "confirmed", probability: 0.9 });
  ledger.decide(l, "F2", "finding-verification", { label: "confirmed", probability: 0.8 });
  ledger.report(l);
  ledger.dispose(l, "F1", "fixed");
  ledger.dispose(l, "F2", "dismissed", "not reachable");
  ledger.startRound(l, { base: "b", head: "h2" });
  assert.deepEqual(ledger.addFindings(l, [finding()]), ["F3"]);
  const s = ledger.summarize([l]);
  assert.equal(s.rounds, 2);
  assert.equal(s.reported, 2);
  assert.equal(s.dismissalRate, 0.5);
  assert.deepEqual(s.modelFamilies, ["anthropic", "openai"]);
  // (0.9 - 1)^2 and (0.8 - 0)^2, averaged
  assert.ok(Math.abs(s.verificationBrier - (0.01 + 0.64) / 2) < 1e-9);
  assert.throws(() => ledger.dispose(l, "F1", "meh"), /--as must be/);
});

test("ledger CLI: start, add, decide, report and last-head round-trip through the file", () => {
  const run = (...a) => execFileSync("node", [LEDGER, ...a], { encoding: "utf8" });
  const base = ["--repo", "o/cli", "--key", "feature/x"];
  run("start", ...base, "--base", "b", "--head", "abc123", "--lenses", "correctness,tests");
  const file = join(process.env.SCALVERT_STATE_DIR, "f.json");
  writeFileSync(file, JSON.stringify([finding()]));
  assert.deepEqual(JSON.parse(run("add", ...base, "--file", file)).added, ["F1"]);
  run("decide", ...base, "--id", "F1", "--kind", "finding-verification", "--json", '{"label":"confirmed","probability":0.75}');
  assert.throws(() => execFileSync("node", [LEDGER, "report", ...base], { stdio: "pipe" }), /no recorded run/);
  assert.equal(JSON.parse(run("report", ...base, "--allow-missing")).missingLenses.length, 2);
  run("ran", ...base, "--lens", "correctness", "--model", "anthropic/claude-x", "--findings", "1");
  run("ran", ...base, "--lens", "tests", "--model", "openai/gpt-x", "--findings", "0");
  const rep = JSON.parse(run("report", ...base));
  assert.equal(rep.findings.length, 1);
  assert.deepEqual(rep.families, ["anthropic", "openai"]);
  assert.equal(run("last-head", ...base).trim(), "abc123");
  assert.match(run("path", ...base), /reviews\/o\/cli\/feature_x\.json/);
  assert.throws(() => execFileSync("node", [LEDGER, "decide", ...base, "--id", "F1", "--kind", "finding-triage", "--json", '{"label":"x","probability":1}'], { stdio: "pipe" }));
});

test("lens choice: correctness always, taste only with axioms, 3 to 6 lenses", () => {
  const src = [{ path: "src/server.ts", added: 5, deleted: 1 }];
  assert.deepEqual(chooseLenses({ files: src, changedText: "+x", hasAxioms: false, hasSpec: true }), ["correctness", "spec-fit", "tests"]);
  assert.ok(chooseLenses({ files: src, changedText: "+x", hasAxioms: true, hasSpec: true }).includes("taste"));
  assert.ok(chooseLenses({ files: src, changedText: "+const token = req.headers.auth", hasAxioms: false, hasSpec: true }).includes("security"));
  const docsOnly = chooseLenses({ files: [{ path: "README.md", added: 1, deleted: 0 }], changedText: "+x", hasAxioms: false, hasSpec: false });
  assert.equal(docsOnly[0], "correctness");
  assert.ok(docsOnly.length >= 3 && docsOnly.includes("docs"));
  const everything = chooseLenses({
    files: [
      { path: "src/auth/index.ts" },
      { path: "migrations/001.sql" },
      { path: "docs/a.md" },
      { path: "package.json" },
    ],
    changedText: "-export function x",
    hasAxioms: true,
    hasSpec: true,
  });
  assert.equal(everything.length, 6);
  assert.deepEqual(everything.slice(0, 2), ["correctness", "spec-fit"]);
});

test("numstat parsing handles binary files and tabs in names", () => {
  assert.deepEqual(parseNumstat("3\t1\ta.ts\n-\t-\timg.png\n"), [
    { path: "a.ts", added: 3, deleted: 1 },
    { path: "img.png", added: 0, deleted: 0 },
  ]);
});

test("pin: a local branch gets diff, files, commits, repo docs and lenses", () => {
  const repo = mkdtempSync(join(tmpdir(), "pin-"));
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(repo, "AGENTS.md"), "# AGENTS\n");
  writeFileSync(join(repo, "REVIEW.md"), "# REVIEW\n");
  writeFileSync(join(repo, "a.js"), "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "topic");
  writeFileSync(join(repo, "a.js"), "export const a = 2;\nexport const b = 3;\n");
  git("commit", "-qam", "change a");
  const first = git("rev-parse", "HEAD").trim();
  writeFileSync(join(repo, "c.js"), "export const c = 4;\n");
  mkdirSync(join(repo, "dist"));
  writeFileSync(join(repo, "dist", "c.js"), "generated\n");
  writeFileSync(join(repo, ".gitattributes"), "dist/** linguist-generated=true\n");
  git("add", "-A");
  git("commit", "-q", "-m", "add c");

  const cwd = process.cwd();
  const env = process.env.AXIOMS_PATH;
  process.env.AXIOMS_PATH = join(repo, "missing-axioms.md");
  try {
    process.chdir(repo);
    const ctx = pin({ base: "main", out: join(repo, ".ctx") });
    assert.equal(ctx.key, "topic");
    assert.equal(ctx.files, 3, "a.js, c.js and .gitattributes; dist/ is generated");
    assert.equal(ctx.generatedSkipped, 1);
    assert.doesNotMatch(readFileSync(join(ctx.dir, "diff.patch"), "utf8"), /dist\/c\.js/);
    assert.deepEqual(ctx.has, { spec: false, agents: true, review: true, axioms: false });
    assert.ok(ctx.lenses.includes("correctness") && !ctx.lenses.includes("taste"));
    assert.match(readFileSync(join(ctx.dir, "commits.txt"), "utf8"), /add c/);
    assert.ok(existsSync(join(ctx.dir, "REVIEW.md")));

    const since = pin({ base: "main", since: first, out: join(repo, ".ctx2") });
    assert.equal(since.files, 2, "only the commit after --since (c.js and .gitattributes)");
  } finally {
    process.chdir(cwd);
    if (env === undefined) delete process.env.AXIOMS_PATH;
    else process.env.AXIOMS_PATH = env;
  }
});

test("lens runner: prompt carries the lens, the gate and the pinned files", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"));
  writeFileSync(join(dir, "diff.patch"), "x");
  writeFileSync(join(dir, "REVIEW.md"), "x");
  const prompt = lensPrompt("security", dir);
  assert.match(prompt, /# Security/);
  assert.match(prompt, /Report a finding only when all of these are true/);
  assert.match(prompt, /diff\.patch/);
  assert.match(prompt, /REVIEW\.md/);
  assert.doesNotMatch(prompt, /axioms\.md\n/);
  assert.throws(() => lensPrompt("vibes", dir), /unknown lens/);
});

test("lens runner: findings parse from fenced or bare JSON, and the schema is strict", () => {
  const f = { file: "a", line: 1, title: "t", precondition: "p", scenario: "s", evidence: "e", axiom: null };
  assert.deepEqual(parseFindings("```json\n" + JSON.stringify({ findings: [f] }) + "\n```"), [f]);
  assert.deepEqual(parseFindings(JSON.stringify({ findings: [] })), []);
  assert.throws(() => parseFindings("no json here"), /no JSON/);
  const item = FINDING_SCHEMA.properties.findings.items;
  assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort(), "strict outputs need every property required");
  assert.equal(item.additionalProperties, false);
});

test("review threads: unresolved first by age, with the first author and line", async () => {
  const { shapeThreads, parseBlame } = await import("../shared/scalvert/scripts/review-threads.mjs");
  const node = (id, resolved, at, line = 3) => ({
    id, isResolved: resolved, isOutdated: false, path: "a.js", line, originalLine: 9,
    comments: { nodes: [{ id: "c" + id, databaseId: 1, author: { login: "rev" }, body: "b", url: "u" + id, createdAt: at }] },
  });
  const shaped = shapeThreads([node("T2", false, "2026-02-01"), node("T1", false, "2026-01-01"), node("T3", true, "2026-01-15")]);
  assert.deepEqual(shaped.map((t) => t.threadId), ["T1", "T2"]);
  assert.equal(shaped[0].author, "rev");
  assert.equal(shapeThreads([node("T4", false, "x", null)])[0].line, 9, "falls back to originalLine");
  assert.equal(shapeThreads([node("T3", true, "x")], { includeResolved: true }).length, 1);
  const sha = "a".repeat(40);
  assert.deepEqual(parseBlame(`${sha} 3 3 1\nauthor x\nsummary add c\n`), { sha, summary: "add c" });
  assert.equal(parseBlame("fatal: no such path"), null);
});
