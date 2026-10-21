// The review skills on the review harness, end to end through the bundled
// CLI, as an agent runs them: the harness enforces each step, and the
// skills' findings commands present the result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFamilies } from "../cli/src/harness.mjs";

const CLI = new URL("../shared/scalvert/scripts/agent-review.mjs", import.meta.url).pathname;
// Model IDs as Tau gives them: one gateway, two families.
const OPUS = "glean/CLAUDE_5_5_OPUS";
const SOL = "glean/GPT6_1_SOL";
const K = ["--repo", "acme/widgets", "--key", "7"];

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "skills-harness-"));
  const git = (...a) => execFileSync("git", ["-C", dir, "-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.js"), "1\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "fix");
  const change = (text) => {
    writeFileSync(join(dir, "a.js"), text);
    git("commit", "-q", "-am", text.trim());
    return git("rev-parse", "HEAD");
  };
  return { dir, git, change, head: change("2\n") };
}

function cli(dir, state) {
  return (args, { input } = {}) => {
    const r = spawnSync("node", [CLI, ...args], {
      cwd: dir,
      input,
      encoding: "utf8",
      env: { ...process.env, AGENT_REVIEWS_STATE_DIR: state, AGENT_REVIEW_ACTOR: "agent:test" },
    });
    let json = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {}
    return { ...r, json, err: (() => { try { return JSON.parse(r.stderr).error; } catch { return null; } })() };
  };
}

const finding = (over = {}) =>
  JSON.stringify([{ title: "the retry loop never ends", file: "a.js", line: 1, precondition: "the server is down", scenario: "fetch retries forever", evidence: "a.js:1 has no limit", class: "unbounded-retry", instances: [{ file: "b.js", line: 4 }], ...over }]);

test("a review through the harness: gateway families, refused skips, the report, threads and the summary", () => {
  const { dir, change, head } = repo();
  const state = mkdtempSync(join(tmpdir(), "skills-state-"));
  const run = cli(dir, state);
  const ok = (args, opts) => {
    const r = run(args, opts);
    assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}`);
    return r;
  };

  ok(["review", "start", ...K, "--head", "fix", "--target", "main", "--lenses", "correctness,security", "--depth", "standard"]);
  // Skipping the panel is refused, with every reason.
  const early = run(["review", "advance", ...K]);
  assert.equal(early.status, 1);
  assert.deepEqual(early.err.reasons.map((r) => r.code), ["run-missing", "run-missing", "too-few-reviewers", "too-few-families"]);

  ok(["review", "run", ...K, "--slot", "correctness", "--status", "ok", "--model", OPUS, "--findings", "-", "--head", "fix"], { input: finding() });
  ok(["review", "run", ...K, "--slot", "security", "--status", "ok", "--model", SOL, "--head", "fix"]);
  // Two families behind one gateway: the skills fill in each one.
  ok(["review", "advance", ...K]);

  // The author's own family cannot verify it.
  const self = run(["review", "decide", ...K, "--candidate", "1", "--kind", "finding-verification", "--label", "confirmed", "--probability", "0.9", "--rationale", "r", "--verifier-model", "glean/CLAUDE_5_5_SONNET", "--head", "fix"]);
  assert.equal(self.status, 1);
  assert.deepEqual(self.err.reasons.map((r) => r.code), ["verifier-not-independent"]);
  for (const [kind, label] of [["finding-verification", "confirmed"], ["finding-severity", "should-fix"], ["finding-origin", "introduced"], ["finding-triage", "agent-fixable"]]) {
    ok(["review", "decide", ...K, "--candidate", "1", "--kind", kind, "--label", label, "--probability", "0.9", "--rationale", "read the loop", "--verifier-model", SOL, "--head", "fix"]);
  }
  ok(["review", "report", ...K]);

  const shown = ok(["findings", "report", ...K]);
  const report = shown.json;
  assert.equal(report.verdict, "needs-changes");
  assert.deepEqual(report.counts, { blockers: 0, "should-fix": 1, "pre-existing": 0, smaller: 0, unrated: 0 });
  assert.deepEqual(report.findings.map((f) => [f.n, f.section, f.instances]), [[1, "should-fix", [{ file: "b.js", line: 4 }]]]);
  // Nothing the report prints is an internal key, so none can be copied into a comment.
  assert.doesNotMatch(shown.stdout, /\bF[0-9]+\b/);
  assert.equal("id" in report.findings[0], false);
  assert.deepEqual(report.findings[0].foundBy, { reviewers: 1, lenses: ["correctness"], families: ["anthropic"] });
  assert.deepEqual(report.families, ["anthropic", "openai"]);

  ok(["review", "link", ...K, "--finding", "1", "--thread", "PRRT_1", "--url", "https://github.com/acme/widgets/pull/7#discussion_r1"]);
  assert.deepEqual(ok(["findings", "open", ...K]).json.map((f) => [f.n, f.title, f.thread]), [[1, "the retry loop never ends", "PRRT_1"]]);
  assert.equal(ok(["findings", "last-head", ...K]).stdout.trim(), head);
  ok(["review", "dispose", ...K, "--finding", "1", "--as", "fixed"]);
  assert.deepEqual(ok(["findings", "open", ...K]).json, []);

  const summary = ok(["ledger", "summary", "--repo", "acme/widgets"]).json;
  assert.equal(summary.ledgers, 1);
  assert.deepEqual([summary.reported, summary.dispositions], [1, { fixed: 1 }]);
  assert.deepEqual(summary.byModel[OPUS], { reported: 1, disposed: 1, fixed: 1, noise: 0, noiseRate: 0 });

  // Round 2: the same bug comes back after the fix. It is reported again,
  // marked as recurring, because the fix did not hold.
  change("3\n");
  ok(["review", "start", ...K, "--head", "fix", "--target", "main", "--lenses", "correctness,security"]);
  ok(["review", "run", ...K, "--slot", "correctness", "--status", "ok", "--model", OPUS, "--findings", "-", "--head", "fix"], { input: finding({ line: 2 }) });
  ok(["review", "run", ...K, "--slot", "security", "--status", "ok", "--model", SOL, "--head", "fix"]);
  ok(["review", "advance", ...K]);
  for (const [kind, label] of [["finding-verification", "confirmed"], ["finding-severity", "should-fix"], ["finding-origin", "introduced"]]) {
    ok(["review", "decide", ...K, "--candidate", "1", "--kind", kind, "--label", label, "--probability", "0.9", "--rationale", "r", "--verifier-model", SOL, "--head", "fix"]);
  }
  ok(["review", "report", ...K]);
  const second = ok(["findings", "report", ...K]).json;
  assert.equal(second.round, 2);
  assert.deepEqual(second.findings.map((f) => [f.n, f.recurs.map((r) => r.n)]), [[2, [1]]], "numbers continue across rounds");
  assert.deepEqual(second.repeats, []);
});

test("a finding that may repeat a waved-off one is marked, never hidden; earlier findings close in later rounds; disputes wait on a person", () => {
  const { dir, change } = repo();
  const state = mkdtempSync(join(tmpdir(), "skills-state-"));
  const run = cli(dir, state);
  const ok = (args, opts) => {
    const r = run(args, opts);
    assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}`);
    return r;
  };
  const round = (findings, decide) => {
    ok(["review", "start", ...K, "--head", "fix", "--target", "main", "--lenses", "correctness,security"]);
    ok(["review", "run", ...K, "--slot", "correctness", "--status", "ok", "--model", OPUS, "--findings", "-", "--head", "fix"], { input: findings });
    ok(["review", "run", ...K, "--slot", "security", "--status", "ok", "--model", SOL, "--head", "fix"]);
    ok(["review", "advance", ...K]);
    decide();
    ok(["review", "report", ...K]);
    return ok(["findings", "report", ...K]).json;
  };
  const d = (candidate, kind, label, model = SOL) => ok(["review", "decide", ...K, "--candidate", String(candidate), "--kind", kind, "--label", label, "--probability", "0.9", "--rationale", "r", "--verifier-model", model, "--head", "fix"]);
  const rate = (id) => {
    d(id, "finding-severity", "should-fix");
    d(id, "finding-origin", "introduced");
  };

  round(finding(), () => {
    d(1, "finding-verification", "confirmed");
    rate(1);
  });
  // Clearing a should-fix is a person's call, and a note copied from GitHub
  // comes in through a file, so shell text in it never runs.
  const waveOff = run(["review", "dispose", ...K, "--finding", "1", "--as", "intended"]);
  assert.equal(waveOff.status, 1);
  assert.equal(waveOff.err.code, "workflow/forbidden");
  const reply = "Retrying forever is on purpose: $(touch pwned) the queue owns backoff.";
  ok(["review", "dispose", ...K, "--finding", "1", "--as", "intended", "--note-file", "-", "--actor", "human:steve"], { input: reply });
  const status = ok(["review", "status", ...K]).json;
  assert.equal(status.findings.find((f) => f.number === 1).disposition.note, reply);
  assert.ok(!existsSync(join(dir, "pwned")));

  change("3\n");
  const second = round(finding({ title: "retries without a limit" }), () => {
    d(1, "finding-verification", "confirmed");
    rate(1);
  });
  // Nearness and class are a hint, not proof: the finding stays, marked.
  const earlier = { n: 1, round: 1, title: "the retry loop never ends", file: "a.js", line: 1, disposition: "intended" };
  assert.deepEqual(second.findings.map((f) => [f.n, f.section, f.repeatOf]), [[2, "should-fix", [earlier]]]);
  assert.deepEqual(second.repeats, [{ n: 2, earlier: [earlier] }]);
  assert.equal(second.verdict, "needs-changes");

  change("4\n");
  const third = round(finding({ file: "c.js", class: "other" }), () => {
    d(1, "finding-verification", "confirmed");
    d(1, "finding-verification", "refuted", "google/gemini-3");
    rate(1);
  });
  assert.equal(third.verdict, "needs-a-person");
  assert.deepEqual(third.waiting.map((w) => [w.code, w.finding]), [["verifiers-disagree", 3]], "a disputed finding is numbered too");
  assert.deepEqual(third.dropped, []);
  assert.deepEqual(third.earlierOpen["should-fix"], 1, "finding 2, from round 2, is still open");
  // In round 3, finding 2 from round 2 turns out fixed; it can be closed now.
  ok(["review", "dispose", ...K, "--finding", "2", "--as", "fixed"]);
  assert.deepEqual(ok(["findings", "open", ...K]).json, []);
  assert.equal(ok(["findings", "report", ...K]).json.earlierOpen["should-fix"], 0);
});

test("a finding a person must judge, or a policy change a person rejected, holds the verdict", () => {
  const { dir, change, git } = repo();
  const run = cli(dir, mkdtempSync(join(tmpdir(), "skills-state-")));
  const ok = (args, opts) => {
    const r = run(args, opts);
    assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}`);
    return r;
  };
  ok(["review", "start", ...K, "--head", "fix", "--target", "main", "--lenses", "correctness,security"]);
  ok(["review", "run", ...K, "--slot", "correctness", "--status", "ok", "--model", OPUS, "--findings", "-", "--head", "fix"], { input: finding() });
  ok(["review", "run", ...K, "--slot", "security", "--status", "ok", "--model", SOL, "--head", "fix"]);
  ok(["review", "advance", ...K]);
  for (const [kind, label] of [["finding-verification", "confirmed"], ["finding-severity", "nit"], ["finding-origin", "introduced"], ["finding-triage", "needs-judgment"]]) {
    ok(["review", "decide", ...K, "--candidate", "1", "--kind", kind, "--label", label, "--probability", "0.9", "--rationale", "r", "--verifier-model", SOL, "--head", "fix"]);
  }
  ok(["review", "report", ...K]);
  const judged = ok(["findings", "report", ...K]).json;
  assert.equal(judged.verdict, "needs-a-person", "only a nit, but a person must decide it");
  assert.deepEqual(judged.waiting.map((w) => [w.code, w.finding]), [["needs-judgment", 1]]);

  // The change edits the review policy; a person rejects that.
  writeFileSync(join(dir, "agent-review.json"), `${JSON.stringify({ version: 1, review: { minReviewers: 1 } })}\n`);
  git("add", "-A");
  change("5\n");
  ok(["review", "start", ...K, "--head", "fix", "--target", "main", "--lenses", "correctness,security"]);
  ok(["review", "run", ...K, "--slot", "correctness", "--status", "ok", "--model", OPUS, "--head", "fix"]);
  ok(["review", "run", ...K, "--slot", "security", "--status", "ok", "--model", SOL, "--head", "fix"]);
  ok(["review", "advance", ...K]);
  ok(["review", "report", ...K]);
  ok(["review", "dispose", ...K, "--finding", "1", "--as", "not-worth-it", "--actor", "human:steve"]);
  const raised = ok(["findings", "report", ...K]).json;
  assert.equal(raised.verdict, "needs-a-person");
  const esc = raised.waiting.find((w) => w.escalation).escalation;
  ok(["review", "resolve", ...K, "--escalation", esc, "--decision", "reject", "--reason", "keep two reviewers", "--actor", "human:steve"]);
  const rejected = ok(["findings", "report", ...K]).json;
  assert.equal(rejected.verdict, "needs-changes");
  assert.deepEqual(rejected.rejected.map((x) => [x.escalation, x.reason, x.by]), [[esc, "keep two reviewers", "human:steve"]]);
});

test("a review from before the harness: its open findings and last head carry over, and the summary counts it once", () => {
  const { dir, change } = repo();
  const state = mkdtempSync(join(tmpdir(), "skills-state-"));
  const run = cli(dir, state);
  const ok = (args, opts) => {
    const r = run(args, opts);
    assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}`);
    return r;
  };
  const v1 = join(state, "reviews", "acme", "widgets");
  mkdirSync(v1, { recursive: true });
  const verified = { label: "confirmed", probability: 0.9, model: SOL };
  writeFileSync(join(v1, "7.json"), JSON.stringify({
    schema: "scalvert.review/v1", repo: "acme/widgets", key: "7",
    rounds: [{ round: 1, base: "b".repeat(40), head: "a".repeat(40), lenses: ["correctness"], depth: "quick", runs: [{ lens: "correctness", model: OPUS, findings: 1 }] }],
    findings: [{ id: "F1", round: 1, lens: "correctness", model: OPUS, file: "z.js", line: 9, title: "old bug", reported: true, decisions: { "finding-verification": verified, "finding-severity": { label: "blocker", probability: 0.9, model: SOL }, "finding-origin": { label: "introduced", probability: 0.9, model: SOL } }, disposition: null }],
  }));
  assert.equal(ok(["findings", "last-head", ...K]).stdout.trim(), "a".repeat(40));
  // A v1 finding has no number. It is closed with ledger dispose and its v1 ID.
  assert.deepEqual(ok(["findings", "open", ...K]).json.map((f) => [f.n, f.v1Id, f.source, f.round]), [[null, "F1", "v1", 1]]);

  ok(["review", "start", ...K, "--head", "fix", "--target", "main", "--lenses", "correctness,security", "--depth", "standard"]);
  ok(["review", "run", ...K, "--slot", "correctness", "--status", "ok", "--model", OPUS, "--findings", "-", "--head", "fix"], { input: finding({ file: "q.js", class: "other" }) });
  ok(["review", "run", ...K, "--slot", "security", "--status", "ok", "--model", SOL, "--head", "fix"]);
  ok(["review", "advance", ...K]);
  ok(["review", "decide", ...K, "--candidate", "1", "--kind", "finding-verification", "--label", "refuted", "--probability", "0.1", "--rationale", "r", "--verifier-model", SOL, "--head", "fix"]);
  ok(["review", "report", ...K]);
  const report = ok(["findings", "report", ...K]).json;
  assert.equal(report.round, 2, "harness rounds come after the v1 rounds");
  assert.equal(report.earlierOpen.blockers, 1, "the open v1 blocker still holds the change");
  assert.equal(report.verdict, "needs-changes");
  ok(["ledger", "dispose", ...K, "--id", "F1", "--as", "fixed"]);
  assert.equal(ok(["findings", "report", ...K]).json.verdict, "ready");

  const summary = ok(["ledger", "summary", "--repo", "acme/widgets", "--key", "7"]).json;
  assert.deepEqual([summary.ledgers, summary.rounds], [1, 2], "one change, two rounds");
  // The v1 round's finding keeps its depth: harness round 1 is round 2 here,
  // so its standard depth does not overwrite the v1 round's quick one.
  assert.deepEqual(Object.keys(summary.byDepth), ["quick"]);
});

test("duplicates merged in a chain all count toward their top finding", () => {
  const { dir } = repo();
  const run = cli(dir, mkdtempSync(join(tmpdir(), "skills-state-")));
  const ok = (args, opts) => {
    const r = run(args, opts);
    assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}`);
    return r;
  };
  const at = (file, line) => ({ title: `bug at ${file}`, file, line, precondition: "p", scenario: "s", evidence: "e" });
  ok(["review", "start", ...K, "--head", "fix", "--target", "main", "--lenses", "correctness,security"]);
  ok(["review", "run", ...K, "--slot", "correctness", "--status", "ok", "--model", OPUS, "--findings", "-", "--head", "fix"], { input: JSON.stringify([at("a.js", 10), at("b.js", 20)]) });
  ok(["review", "run", ...K, "--slot", "security", "--status", "ok", "--model", SOL, "--findings", "-", "--head", "fix"], { input: JSON.stringify([at("c.js", 30)]) });
  ok(["review", "merge", ...K, "--into", "2", "--duplicates", "3"]);
  ok(["review", "merge", ...K, "--into", "1", "--duplicates", "2"]);
  ok(["review", "advance", ...K]);
  for (const [kind, label] of [["finding-verification", "confirmed"], ["finding-severity", "should-fix"], ["finding-origin", "introduced"]]) {
    ok(["review", "decide", ...K, "--candidate", "1", "--kind", kind, "--label", label, "--probability", "0.9", "--rationale", "r", "--verifier-model", SOL, "--head", "fix"]);
  }
  ok(["review", "report", ...K]);
  const [f] = ok(["findings", "report", ...K]).json.findings;
  assert.deepEqual(f.instances, [{ file: "b.js", line: 20 }, { file: "c.js", line: 30 }]);
  assert.deepEqual(f.foundBy, { reviewers: 3, lenses: ["correctness", "security"], families: ["anthropic", "openai"] });
});

test("past the round cap, an agent is refused and a person can go on", () => {
  const { dir, change } = repo();
  const state = mkdtempSync(join(tmpdir(), "skills-state-"));
  const run = cli(dir, state);
  for (const n of ["3", "4"]) {
    assert.equal(run(["review", "start", ...K, "--head", "fix", "--target", "main"]).status, 0);
    change(`${n}\n`);
  }
  assert.equal(run(["review", "start", ...K, "--head", "fix", "--target", "main"]).status, 0);
  change("5\n");
  const capped = run(["review", "start", ...K, "--head", "fix", "--target", "main"]);
  assert.equal(capped.status, 1);
  assert.deepEqual(capped.err.reasons.map((r) => r.code), ["round-cap"]);
  assert.equal(run(["review", "start", ...K, "--head", "fix", "--target", "main", "--past-cap", "--actor", "human:steve"]).status, 0);
});

test("review policy is the harness's policy check; policy is still the permission rules", () => {
  const { dir } = repo();
  const run = cli(dir, mkdtempSync(join(tmpdir(), "skills-state-")));
  const p = run(["review", "policy", "--target", "main"]);
  assert.equal(p.status, 0, p.stderr);
  assert.equal(p.json.policy.review.maxRounds, 3);
  const perms = run(["policy", "preset", "local-only"]);
  assert.equal(perms.status, 0, perms.stderr);
  assert.ok(perms.json.permissions);
});

test("families are filled in for gateway models, and a family the caller gives wins", () => {
  assert.deepEqual(withFamilies(["review", "run", "--model", OPUS]), ["review", "run", "--model", OPUS, "--family", "anthropic"]);
  assert.deepEqual(withFamilies(["review", "decide", `--verifier-model=${SOL}`]), ["review", "decide", `--verifier-model=${SOL}`, "--verifier-family", "openai"]);
  assert.deepEqual(withFamilies(["review", "run", "--model", OPUS, "--family", "x"]), ["review", "run", "--model", OPUS, "--family", "x"]);
  assert.deepEqual(withFamilies(["review", "next"]), ["review", "next"]);
  // The last --model wins, as in the harness's parser.
  assert.deepEqual(withFamilies(["review", "run", "--model", OPUS, `--model=${SOL}`]), ["review", "run", "--model", OPUS, `--model=${SOL}`, "--family", "openai"]);
  // An unknown gateway model gets no family here; the harness counts it as the gateway's.
  assert.deepEqual(withFamilies(["review", "run", "--model", "glean/ALIAS_A"]), ["review", "run", "--model", "glean/ALIAS_A"]);
  assert.deepEqual(withFamilies(["review", "run", "--model", "anthropic/opus"]), ["review", "run", "--model", "anthropic/opus"]);
});

test("two unknown gateway models do not pass as two families", () => {
  const { dir } = repo();
  const run = cli(dir, mkdtempSync(join(tmpdir(), "skills-state-")));
  run(["review", "start", ...K, "--head", "fix", "--target", "main", "--lenses", "correctness,security"]);
  run(["review", "run", ...K, "--slot", "correctness", "--status", "ok", "--model", "glean/ALIAS_A", "--head", "fix"]);
  run(["review", "run", ...K, "--slot", "security", "--status", "ok", "--model", "glean/ALIAS_B", "--head", "fix"]);
  const r = run(["review", "advance", ...K]);
  assert.equal(r.status, 1);
  assert.deepEqual(r.err.reasons.map((x) => x.code), ["too-few-families"]);
});

test("review --help lists the harness's commands under the names they have here, and exits 0", () => {
  const r = spawnSync("node", [CLI, "review", "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /review start/);
  assert.match(r.stdout, /^\s+review policy/m);
  assert.doesNotMatch(r.stdout, /^\s+policy check/m);
});
