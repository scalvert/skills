// Convergence: a review must settle in a few rounds. These cover the round
// cap, no repeats of earlier findings, origin (only introduced findings can
// block), bug classes with every instance, and the metrics that track noise
// and rounds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ledger from "../cli/src/review-ledger.mjs";
import { FINDING_SCHEMA, lensPrompt } from "../cli/src/run-lens.mjs";

const CLI = new URL("../shared/scalvert/scripts/agent-review.mjs", import.meta.url).pathname;
process.env.AGENT_REVIEWS_STATE_DIR = mkdtempSync(join(tmpdir(), "convergence-state-"));

const fresh = (repo = "o/r", key = "1") => ({ schema: ledger.SCHEMA, repo, key, rounds: [], findings: [] });
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
const round = (l, head = `h${l.rounds.length + 1}`) => {
  ledger.startRound(l, { base: "b", head, lenses: ["correctness"], pastCap: true });
  ledger.recordRun(l, { lens: "correctness", model: "anthropic/claude-x" });
};
const confirm = (l, id, { severity = "should-fix", origin = "introduced" } = {}) => {
  ledger.decide(l, id, "finding-verification", { label: "confirmed", probability: 0.9 });
  ledger.decide(l, id, "finding-severity", { label: severity, probability: 0.9 });
  if (origin) ledger.decide(l, id, "finding-origin", { label: origin, probability: 0.9 });
};

test("round cap: a 4th round needs --past-cap", () => {
  const l = fresh();
  for (let i = 1; i <= ledger.MAX_ROUNDS; i++) ledger.startRound(l, { base: "b", head: `h${i}` });
  assert.throws(() => ledger.startRound(l, { base: "b", head: "h4" }), /3 review rounds.*step back.*--past-cap/);
  assert.equal(ledger.startRound(l, { base: "b", head: "h4", pastCap: true }), 4);
});

test("no repeats: a new finding near an earlier one, even a closed one, must be merged or kept", () => {
  const l = fresh();
  round(l);
  ledger.addFindings(l, [finding({ line: 10, class: "missing-empty-check" })]);
  confirm(l, "F1");
  ledger.report(l);
  ledger.dispose(l, "F1", "wrong", "list is never empty here");

  round(l);
  ledger.addFindings(l, [
    finding({ line: 12 }), // nearby lines
    finding({ line: 200, class: "missing-empty-check" }), // same class, same file
    finding({ file: "src/other.ts", line: 10, class: "missing-empty-check" }), // other file: not a repeat
  ]);
  for (const id of ["F2", "F3", "F4"]) confirm(l, id);
  assert.throws(() => ledger.report(l), /F2 \(src\/a\.ts:12\) may repeat F1 from round 1 \(src\/a\.ts:10, wrong\).*F3 .*may repeat F1/);

  ledger.mergeFindings(l, "F1", ["F2"]);
  const r = ledger.report(l, undefined, { keep: ["F3"] });
  assert.deepEqual(r.findings.map((f) => f.id).sort(), ["F3", "F4"]);
  assert.equal(l.findings.find((f) => f.id === "F2").reported, false, "a merged repeat is never reported again");
});

test("no repeats: an earlier finding's instances count, and so do a merged duplicate's", () => {
  const l = fresh();
  round(l);
  ledger.addFindings(l, [
    finding({ file: "src/a.ts", line: 10, class: "off-by-one", instances: [{ file: "src/b.ts", line: 20 }] }),
    finding({ file: "src/a.ts", line: 10, class: "off-by-one", instances: [{ file: "src/c.ts", line: 30 }] }),
  ]);
  ledger.mergeFindings(l, "F1", ["F2"]);
  confirm(l, "F1");
  const r1 = ledger.report(l);
  assert.deepEqual(r1.findings[0].instances, [{ file: "src/b.ts", line: 20 }, { file: "src/c.ts", line: 30 }], "a merge keeps every place");
  ledger.dispose(l, "F1", "intended");

  round(l);
  ledger.addFindings(l, [
    finding({ file: "src/b.ts", line: 21 }), // an instance of F1, nearby line
    finding({ file: "src/c.ts", line: 300, class: "off-by-one" }), // the duplicate's instance file, same class
    finding({ file: "src/z.ts", line: 1, instances: [{ file: "src/a.ts", line: 11 }] }), // its own instance hits F1
    finding({ file: "src/d.ts", line: 20 }), // unrelated
  ]);
  for (const id of ["F3", "F4", "F5", "F6"]) confirm(l, id);
  const err = (() => {
    try {
      ledger.report(l);
    } catch (e) {
      return e.message;
    }
  })();
  for (const id of ["F3", "F4", "F5"]) assert.match(err, new RegExp(`${id} \\([^)]*\\) may repeat F1`));
  assert.doesNotMatch(err, /F6/);
});

test("a problem that comes back after it was marked fixed is reported again, pointing to the old finding", () => {
  const l = fresh();
  round(l);
  ledger.addFindings(l, [finding({ line: 10, class: "off-by-one" }), finding({ file: "src/w.ts", line: 5 })]);
  confirm(l, "F1");
  confirm(l, "F2");
  ledger.report(l);
  ledger.dispose(l, "F1", "fixed");
  ledger.dispose(l, "F2", "wrong");

  round(l);
  ledger.addFindings(l, [finding({ line: 11, class: "off-by-one" }), finding({ file: "src/w.ts", line: 6 })]);
  confirm(l, "F3");
  confirm(l, "F4");
  assert.throws(() => ledger.report(l), /F4 .*may repeat F2/, "a finding called wrong still may not come back");
  const r = ledger.report(l, undefined, { keep: ["F4"] });
  const f3 = r.findings.find((f) => f.id === "F3");
  assert.deepEqual(f3.recurs, [{ id: "F1", round: 1, file: "src/a.ts", line: 10 }]);
  assert.deepEqual(r.findings.find((f) => f.id === "F4").recurs, []);
});

test("model families: gateway IDs such as glean/... count by provider", () => {
  assert.equal(ledger.family("glean/CLAUDE_5_5_OPUS"), "anthropic");
  assert.equal(ledger.family("glean/GPT6_1_SOL"), "openai");
  assert.equal(ledger.family("glean/GROK_4_7"), "xai");
  assert.equal(ledger.family("glean/GEMINI_3_PRO"), "google");
  assert.equal(ledger.family("glean/SOMETHING_NEW"), "glean:something_new", "an unknown gateway model is its own family, never merged with another");
  assert.equal(ledger.family("anthropic/claude-x"), "anthropic");
  assert.equal(ledger.family("openai/gpt-x"), "openai");

  const l = fresh();
  ledger.startRound(l, { base: "b", head: "h", lenses: ["correctness", "tests"] });
  ledger.recordRun(l, { lens: "correctness", model: "glean/GPT6_1_SOL" });
  ledger.recordRun(l, { lens: "tests", model: "glean/CLAUDE_5_5_OPUS" });
  ledger.addFindings(l, [finding({ model: "glean/GPT6_1_SOL" }), finding({ model: "glean/CLAUDE_5_5_OPUS", lens: "tests" })]);
  ledger.mergeFindings(l, "F1", ["F2"]);
  confirm(l, "F1");
  const r = ledger.report(l);
  assert.deepEqual(r.families, ["anthropic", "openai"]);
  assert.deepEqual(r.findings[0].foundBy.families, ["anthropic", "openai"]);
});

test("verdict: ready only when nothing new or still open holds the PR back", () => {
  const l = fresh();
  round(l);
  ledger.addFindings(l, [finding({ file: "src/a.ts" })]);
  confirm(l, "F1", { severity: "blocker" });
  assert.equal(ledger.report(l).verdict, "needs-changes");

  round(l); // the blocker is not fixed, and nothing new turns up
  const r2 = ledger.report(l);
  assert.deepEqual([r2.verdict, r2.counts.blockers, r2.earlierOpen.blockers], ["needs-changes", 0, 1]);

  ledger.dispose(l, "F1", "fixed");
  round(l);
  ledger.addFindings(l, [finding({ file: "src/n.ts" }), finding({ file: "src/p.ts" })]);
  confirm(l, "F2", { severity: "nit" });
  confirm(l, "F3", { severity: "should-fix", origin: "pre-existing" });
  const r3 = ledger.report(l);
  assert.deepEqual([r3.verdict, r3.counts.smaller, r3.counts["pre-existing"]], ["ready", 1, 1], "pre-existing and smaller items never hold a PR back");
});

test("origin: only introduced findings block; missed and pre-existing drop to should-fix", () => {
  const l = fresh();
  round(l);
  ledger.addFindings(l, [finding({ file: "src/r1.ts" })]);
  assert.throws(
    () => ledger.decide(l, "F1", "finding-origin", { label: "missed", probability: 0.9 }),
    /round 1; "missed" needs an earlier round/,
  );
  confirm(l, "F1", { severity: "nit" });
  ledger.report(l);

  round(l);
  ledger.addFindings(l, [
    finding({ file: "src/n.ts", title: "nit" }),
    finding({ file: "src/p.ts", title: "old bug" }),
    finding({ file: "src/m.ts", title: "missed" }),
    finding({ file: "src/b.ts", title: "new bug" }),
    finding({ file: "src/s.ts", title: "should" }),
  ]);
  confirm(l, "F2", { severity: "nit" });
  confirm(l, "F3", { severity: "blocker", origin: "pre-existing" });
  confirm(l, "F4", { severity: "blocker", origin: "missed" });
  confirm(l, "F5", { severity: "blocker", origin: null });
  confirm(l, "F6");
  assert.throws(() => ledger.report(l), /blocker\(s\) F5 have no finding-origin/);
  ledger.decide(l, "F5", "finding-origin", { label: "introduced", probability: 0.9 });

  const r = ledger.report(l);
  assert.deepEqual(
    r.findings.map((f) => [f.n, f.title, f.section, f.severity, f.cappedFrom]),
    [
      [1, "new bug", "blockers", "blocker", null],
      [2, "missed", "should-fix", "should-fix", "blocker"],
      [3, "should", "should-fix", "should-fix", null],
      [4, "old bug", "pre-existing", "should-fix", "blocker"],
      [5, "nit", "smaller", "nit", null],
    ],
  );
  assert.deepEqual(r.counts, { blockers: 1, "should-fix": 2, "pre-existing": 1, smaller: 1, unrated: 0 });
});

test("bug class and instances: stored with the finding, validated, and asked of every reviewer", () => {
  const l = fresh();
  round(l);
  ledger.addFindings(l, [
    finding({ class: "unescaped-shell-arg", instances: [{ file: "src/b.ts", line: 3 }, { file: "src/c.ts" }] }),
  ]);
  assert.equal(l.findings[0].class, "unescaped-shell-arg");
  assert.deepEqual(l.findings[0].instances, [{ file: "src/b.ts", line: 3 }, { file: "src/c.ts", line: null }]);
  assert.throws(() => ledger.addFindings(l, [finding({ class: "Shell Arg" })]), /class must be kebab-case/);
  assert.throws(() => ledger.addFindings(l, [finding({ instances: [{ line: 3 }] })]), /instances must be a list/);

  const item = FINDING_SCHEMA.properties.findings.items;
  assert.ok(item.required.includes("class") && item.required.includes("instances"));
  const inst = item.properties.instances.items;
  assert.deepEqual([...inst.required].sort(), Object.keys(inst.properties).sort(), "strict outputs need every property required");
  assert.equal(inst.additionalProperties, false);

  const dir = mkdtempSync(join(tmpdir(), "ctx-"));
  writeFileSync(join(dir, "diff.patch"), "x");
  assert.match(lensPrompt("correctness", dir), /Report the class of bug, not one line/);
  assert.match(lensPrompt("spec-fit", dir), /fixes the cause and not one symptom/);
});

test("summary: noise by lens, rounds per review, and repeated classes with the kind of rule to suggest", () => {
  const reviewed = (repo, key, rounds, items) => {
    const l = fresh(repo, key);
    for (let i = 0; i < rounds; i++) ledger.startRound(l, { base: "b", head: `h${i}`, pastCap: true });
    ledger.recordRun(l, { lens: "correctness", model: "anthropic/claude-x" });
    ledger.recordRun(l, { lens: "tests", model: "openai/gpt-x" });
    items.forEach(([lens, cls, as], i) => {
      const [id] = ledger.addFindings(l, [finding({ lens, class: cls, file: `src/f${i}.ts` })]);
      ledger.decide(l, id, "finding-verification", { label: "confirmed", probability: 0.8 });
      ledger.decide(l, id, "finding-severity", { label: "should-fix", probability: 0.9 });
    });
    l.rounds.at(-1).lenses = ["correctness", "tests"];
    ledger.report(l);
    items.forEach(([, , as], i) => as && ledger.dispose(l, `F${i + 1}`, as));
    return l;
  };
  const ledgers = [
    reviewed("o/r", "1", 1, [["correctness", "missing-empty-check", "fixed"], ["tests", "test-name-style", "not-worth-it"]]),
    reviewed("o/r", "2", 2, [["correctness", "missing-empty-check", "fixed"], ["tests", "test-name-style", "intended"]]),
    reviewed("o/r", "3", 5, [["correctness", "missing-empty-check", "accepted"], ["tests", "test-name-style", "wrong"]]),
    reviewed("x/y", "1", 1, [["correctness", "missing-empty-check", "fixed"]]),
  ];
  const s = ledger.summarize(ledgers);
  assert.equal(s.roundsPerLedger, (1 + 2 + 5 + 1) / 4);
  assert.equal(s.oneRoundShare, 0.5);
  assert.equal(s.pastCapShare, 0.25);
  assert.deepEqual(s.dispositions, { fixed: 3, "not-worth-it": 1, intended: 1, accepted: 1, wrong: 1 });
  assert.equal(s.byLens.correctness.noiseRate, 0);
  assert.equal(s.byLens.tests.noiseRate, 1);
  assert.deepEqual(
    s.repeatedClasses.map((c) => [c.repo, c.class, c.findings, c.ledgers, c.suggest.split(":")[0]]),
    [
      ["o/r", "missing-empty-check", 3, 3, "prevent it"],
      ["o/r", "test-name-style", 3, 3, "stop raising it"],
    ],
    "x/y has one finding of the class, below the bar; repos never mix",
  );
  const undecided = [1, 2, 3].map((k) => reviewed("u/v", String(k), 1, [["correctness", "no-signal", null]]));
  assert.deepEqual(
    ledger.summarize(undecided).repeatedClasses.map((c) => [c.class, c.suggest]),
    [["no-signal", null]],
    "no suggestion until people's decisions lean one way",
  );
  // not-worth-it counts as a real finding when scoring the verifier.
  const brier = ledger.summarize([ledgers[0]]).verificationBrier;
  assert.ok(Math.abs(brier - 0.04) < 1e-9, `got ${brier}`);
});

test("ledger CLI: --past-cap, --keep and summary --repo", () => {
  const run = (...args) => JSON.parse(execFileSync("node", [CLI, "ledger", ...args], { encoding: "utf8" }));
  const runFails = (...args) => {
    try {
      execFileSync("node", [CLI, "ledger", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      return e.stderr;
    }
    assert.fail(`expected ${args.join(" ")} to fail`);
  };
  const key = ["--repo", "cli/conv", "--key", "7"];
  for (const h of ["h1", "h2", "h3"]) run("start", ...key, "--base", "b", "--head", h);
  assert.match(runFails("start", ...key, "--base", "b", "--head", "h4"), /--past-cap/);
  assert.equal(run("start", ...key, "--base", "b", "--head", "h4", "--past-cap").round, 4);
  assert.match(runFails("dispose", ...key, "--id", "F1", "--as", "dismissed"), /split; use wrong/);
  assert.equal(run("summary", "--repo", "cli/conv").ledgers, 1);
  assert.equal(run("summary", "--repo", "nobody/here").ledgers, 0);
  assert.match(runFails("summary", "--key", "7"), /--key needs --repo/);

  // --keep reaches the repeat gate through the CLI.
  const k2 = ["--repo", "cli/conv", "--key", "8"];
  const add = (json) => execFileSync("node", [CLI, "ledger", "add", ...k2], { input: JSON.stringify([json]), encoding: "utf8" });
  const confirmCli = (id) =>
    run("decide", ...k2, "--id", id, "--kind", "finding-verification", "--json", '{"label":"confirmed","probability":0.9}');
  for (const h of ["h1", "h2"]) {
    run("start", ...k2, "--base", "b", "--head", h, "--lenses", "correctness");
    run("ran", ...k2, "--lens", "correctness", "--model", "anthropic/claude-x");
    add(finding({ line: h === "h1" ? 10 : 11 }));
    confirmCli(h === "h1" ? "F1" : "F2");
    if (h === "h1") run("report", ...k2);
  }
  assert.match(runFails("report", ...k2), /F2 \(src\/a\.ts:11\) may repeat F1/);
  assert.deepEqual(run("report", ...k2, "--keep", "F2").findings.map((f) => f.id), ["F2"]);
});
