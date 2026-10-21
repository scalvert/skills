import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGithub, codeSpans } from "../cli/src/check-prose.mjs";
import * as ledger from "../cli/src/review-ledger.mjs";

const rules = (text) => checkGithub(text).map((f) => `${f.rule}: ${f.excerpt}`);
const codeFlags = (text) => checkGithub(text).filter((f) => f.rule.startsWith("unformatted code")).map((f) => f.excerpt);

test("flags ledger IDs in text bound for GitHub", () => {
  assert.deepEqual(rules("F1 is fixed, and F12 too."), ["finding ID: F1", "finding ID: F12"]);
  assert.deepEqual(rules("Fixed in `F1` on purpose."), []);
});

test("flags the review's finding numbers in text bound for GitHub", () => {
  assert.deepEqual(rules("Finding 2: the loop never ends. Same as finding #3 and candidate 1."), ["finding number: Finding 2", "finding number: finding #3", "finding number: candidate 1"]);
  assert.deepEqual(rules("Two findings in this file, and 3 candidates."), []);
});

test("flags code outside backticks, once per piece of code", () => {
  assert.deepEqual(codeFlags("listThreads() in src/page.js:12 returns one extra item."), ["listThreads()", "src/page.js:12"]);
  assert.deepEqual(codeFlags("Read opts.repoDir and ledger.rounds."), ["opts.repoDir", "ledger.rounds"]);
  assert.deepEqual(codeFlags("Set AGENT_REVIEWS_STATE_DIR or pass --since."), ["--since", "AGENT_REVIEWS_STATE_DIR"]);
  assert.deepEqual(codeFlags("Edit cli/src/ and README.md, then maxShards."), ["cli/src/", "README.md", "maxShards"]);
});

test("leaves prose that only looks like code alone", () => {
  const prose = [
    "Use and/or, 3/4 of the time, on 2026/10/15.",
    "For example, e.g. and i.e. are fine.",
    "Node.js on macOS, iOS and an iPhone.",
    "The finding(s) and lens(es) wording is fine.",
    "See github.com and example.io.",
    "It stays _in place._",
  ].join("\n\n");
  assert.deepEqual(rules(prose), []);
});

test("does not check code spans, fences, links, HTML or quotes", () => {
  const text = [
    "Good: `src/page.js:12`, `listThreads()` and ``a `nested` span``.",
    "See [src/page.js](https://example.com/src/page.js) and https://example.com/a_b/c.ts.",
    '<img class="graphite__hidden" src="x"> <!-- marker_id -->',
    "[vc]: #eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIn0=",
    "> quoted listThreads() is fine",
    "```ts",
    "const repoDir = opts.repoDir;",
    "```",
    "```suggestion",
    "return items.slice(n * size, n * size + size);",
    "```",
  ].join("\n");
  assert.deepEqual(rules(text), []);
});

test("flags escaped backticks, which GitHub shows as literal backticks", () => {
  const [flag] = checkGithub("Rebased onto \\`mst grade\\` and \\`--no-grade\\`.");
  assert.match(flag.rule, /^escaped backtick/);
});

test("flags a backtick run that nothing closes, as CommonMark reads it", () => {
  assert.deepEqual(rules("A `stray tick here."), ["unbalanced backticks: A `stray tick here."]);
  assert.deepEqual(rules("A fence-like run (` ```ts `) is one span."), []);
  assert.deepEqual(rules("A ``double `inner` span`` is fine."), []);
});

test("code spans read like GitHub: backslashes are literal inside, and spans wrap within a paragraph", () => {
  assert.deepEqual(rules("Use `C:\\temp\\` as the output directory."), []);
  assert.deepEqual(rules("The loop in `listThreads(\nopts)` drops a page."), []);
  // A span never crosses into another block.
  assert.deepEqual(rules("- one `a\n- two b`").map((r) => r.split(":")[0]), ["unbalanced backticks", "unbalanced backticks"]);
  assert.deepEqual(rules("one `a\n\ntwo b`").map((r) => r.split(":")[0]), ["unbalanced backticks", "unbalanced backticks"]);
  // An escape outside a span still flags, even when the rest of the line is fine.
  assert.ok(rules("Fine `code`, then \\`oops\\`.").some((r) => r.startsWith("escaped backtick")));
});

test("reference-style link labels are links, not code", () => {
  assert.deepEqual(rules("See [src/page.js][source].\n\n[source]: https://example.com/a"), []);
  assert.deepEqual(rules("See [src/page.js][].\n\n[src/page.js]: https://example.com/a"), []);
});

test("codeSpans pairs runs of equal length", () => {
  assert.deepEqual(codeSpans("a `b` c").spans, [[2, 5]]);
  assert.deepEqual(codeSpans("``x `y` z``").spans, [[0, 11]]);
  assert.equal(codeSpans("a ` b").unmatched.length, 1);
  assert.deepEqual(codeSpans("a \\`b").escaped, [3]);
  assert.deepEqual(codeSpans("`a\\`").spans, [[0, 4]], "a backslash inside a span does not escape the closing run");
});

test("flags a multi-line code block with no language, but not its closing fence", () => {
  assert.deepEqual(rules("```\nconst x = 1\n```"), ["fence without language: ```"]);
  assert.deepEqual(rules("```sh\nnpm test\n```"), []);
});

test("still applies the prose rules", () => {
  assert.ok(rules("We delve into it.").some((r) => r.startsWith('phrase "delve"')));
});

test("ledger: report numbers findings for people, and link records their threads", () => {
  const l = { schema: ledger.SCHEMA, repo: "o/r", key: "1", rounds: [], findings: [] };
  ledger.startRound(l, { base: "a", head: "b", lenses: ["correctness"] });
  ledger.addFindings(l, [
    { lens: "correctness", file: "src/a.js", line: 1, title: "A", precondition: "p", scenario: "s" },
    { lens: "correctness", file: "src/b.js", line: 2, title: "B", precondition: "p", scenario: "s" },
  ]);
  ledger.recordRun(l, { lens: "correctness", model: "anthropic/claude-x" });
  for (const id of ["F1", "F2"]) ledger.decide(l, id, "finding-verification", { label: "confirmed", probability: 0.9 });
  ledger.decide(l, "F2", "finding-severity", { label: "blocker", probability: 0.9 });
  ledger.decide(l, "F2", "finding-origin", { label: "introduced", probability: 0.9 });
  const r = ledger.report(l);
  assert.deepEqual(r.findings.map((f) => [f.n, f.id]), [[1, "F2"], [2, "F1"]]);

  const thread = ledger.link(l, "F2", { thread: "PRRT_x", url: "https://github.com/o/r/pull/1#discussion_r1" });
  assert.equal(thread.id, "PRRT_x");
  assert.equal(ledger.openFindings(l).find((f) => f.id === "F2").thread.url, "https://github.com/o/r/pull/1#discussion_r1");
  assert.throws(() => ledger.link(l, "F9", { thread: "x" }), /no finding F9/);
  assert.throws(() => ledger.link(l, "F1", {}), /--thread is required/);
});
