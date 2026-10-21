// Review depth and the model plan: precedence, the repo's deep paths, lens
// choice per depth, model choice per role, and pin writing it all down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ledger from "../cli/src/review-ledger.mjs";
import {
  checkRepoConfig,
  checkUserConfig,
  detectHost,
  globToRegExp,
  lensesFor,
  pickTiebreak,
  pickVerifier,
  resolveDepth,
  resolvePlan,
  suggestDepth,
} from "../cli/src/review-plan.mjs";

const CLI = new URL("../shared/scalvert/scripts/agent-review.mjs", import.meta.url).pathname;
const TAU = {
  hosts: {
    tau: {
      fast: ["glean/CLAUDE_5_5_SONNET", "glean/GPT5_4_MINI"],
      strong: ["glean/CLAUDE_5_5_OPUS", "glean/GPT6_1_SOL"],
      tiebreak: ["glean/GROK_4_7"],
    },
  },
};
const file = (path, lines = 10) => ({ path, added: lines, deleted: 0 });

test("globs: ** crosses folders, * and ? stay within one", () => {
  const auth = globToRegExp("src/auth/**");
  assert.ok(auth.test("src/auth/a.js") && auth.test("src/auth/x/y.js"));
  assert.ok(!auth.test("src/authz/a.js"));
  const sql = globToRegExp("**/*.sql");
  assert.ok(sql.test("a.sql") && sql.test("db/m/1.sql") && !sql.test("a.sql.bak"));
  assert.ok(globToRegExp(".github/workflows/*.yml").test(".github/workflows/ci.yml"));
  assert.ok(!globToRegExp("src/?.js").test("src/ab.js"));
});

test("depth: --depth, then the repo, then the user, then the diff; deep paths raise any of them", () => {
  const files = [file("src/a.js")];
  assert.deepEqual(resolveDepth({ flag: "quick", repo: { depth: "deep" }, user: {}, files }).depth, "quick");
  assert.equal(resolveDepth({ repo: { depth: "deep", deepPaths: [] }, user: { depth: "quick" }, files }).source, "agent-review.json");
  assert.equal(resolveDepth({ repo: null, user: { depth: "quick" }, files }).depth, "quick");
  assert.deepEqual(resolveDepth({ repo: null, user: {}, files }), { depth: "standard", source: "suggested from the diff", raisedFrom: null });

  const raised = resolveDepth({ flag: "quick", repo: { deepPaths: ["src/auth/**"] }, user: {}, files: [file("src/auth/token.js")] });
  assert.equal(raised.depth, "deep");
  assert.equal(raised.raisedFrom, "quick");
  assert.match(raised.source, /src\/auth\/token\.js matches src\/auth\/\*\*/);
  assert.throws(() => resolveDepth({ flag: "huge", files }), /depth must be one of/);
});

test("suggested depth: quick only for a small docs-only change", () => {
  assert.equal(suggestDepth([file("README.md", 20), file("docs/a.md", 30)]), "quick");
  assert.equal(suggestDepth([file("README.md", 200)]), "standard");
  assert.equal(suggestDepth([file("README.md"), file("src/a.js")]), "standard");
  assert.equal(suggestDepth([file("src/auth.js")]), "standard", "the security lens alone is not a reason for deep");
});

test("lenses per depth", () => {
  const all = ["correctness", "spec-fit", "security", "tests", "api-compat", "taste", "data", "docs"];
  assert.deepEqual(lensesFor("deep", all), all, "deep keeps every lens the diff calls for");
  assert.equal(lensesFor("standard", all).length, 6);
  const chosen = ["correctness", "spec-fit", "security", "tests", "docs"];
  assert.deepEqual(lensesFor("standard", chosen), chosen);
  assert.deepEqual(lensesFor("quick", chosen), ["correctness", "spec-fit", "security"]);
  assert.deepEqual(lensesFor("deep", ["correctness", "tests", "docs"], { hasSpec: true }), ["correctness", "spec-fit", "security", "tests", "api-compat", "docs"]);
});

test("plan: standard spends the strong tier on correctness, security and verifiers, across two families", () => {
  const plan = resolvePlan({ depth: "standard", lenses: ["correctness", "spec-fit", "security", "tests", "docs"], host: "tau", config: TAU });
  assert.deepEqual(
    plan.reviewers.map((r) => [r.lens, r.tier, r.model, r.thinking]),
    [
      ["correctness", "strong", "glean/CLAUDE_5_5_OPUS", "medium"],
      ["spec-fit", "fast", "glean/CLAUDE_5_5_SONNET", "medium"],
      ["security", "strong", "glean/GPT6_1_SOL", "medium"],
      ["tests", "fast", "glean/GPT5_4_MINI", "medium"],
      ["docs", "fast", "glean/CLAUDE_5_5_SONNET", "medium"],
    ],
  );
  assert.deepEqual([plan.verifier.tier, plan.verifier.thinking, plan.secondVerifierOnBlockers], ["strong", "high", false]);
  assert.deepEqual(plan.warnings, []);

  const quick = resolvePlan({ depth: "quick", lenses: ["correctness", "spec-fit", "tests"], host: "tau", config: TAU });
  assert.ok(quick.reviewers.every((r) => r.tier === "fast" && r.thinking === "low"));
  assert.equal(new Set(quick.reviewers.map((r) => r.family)).size, 2);
  assert.equal(quick.verifier.tier, "fast");

  const deep = resolvePlan({ depth: "deep", lenses: ["correctness", "tests"], host: "tau", config: TAU });
  assert.ok(deep.reviewers.every((r) => r.tier === "strong" && r.thinking === "high"));
  assert.equal(deep.secondVerifierOnBlockers, true);
});

test("plan: one configured family borrows another, or warns; no config leaves models to the agent", () => {
  const oneFamily = { hosts: { tau: { fast: ["glean/CLAUDE_5_5_SONNET"], strong: ["glean/CLAUDE_5_5_OPUS"], tiebreak: ["glean/GPT6_1_SOL"] } } };
  const borrowed = resolvePlan({ depth: "quick", lenses: ["correctness", "tests", "docs"], host: "tau", config: oneFamily });
  assert.deepEqual(borrowed.reviewers.at(-1), { lens: "docs", tier: "borrowed", model: "glean/GPT6_1_SOL", family: "openai", thinking: "low" });

  const only = { hosts: { tau: { fast: ["glean/CLAUDE_5_5_SONNET"] } } };
  assert.match(resolvePlan({ depth: "quick", lenses: ["correctness", "tests"], host: "tau", config: only }).warnings[0], /only one model family/);

  const none = resolvePlan({ depth: "standard", lenses: ["correctness", "tests"], host: "tau", config: {} });
  assert.ok(none.reviewers.every((r) => r.model === null));
  assert.match(none.warnings[0], /no strong or fast models configured for tau/);
  assert.match(resolvePlan({ depth: "standard", lenses: ["correctness"], host: null, config: TAU }).warnings[0], /host unknown/);
});

test("verifier and tie-break come from families the finding has not seen", () => {
  const plan = resolvePlan({ depth: "standard", lenses: ["correctness"], host: "tau", config: TAU });
  assert.equal(pickVerifier(plan, "glean/GPT6_1_SOL", TAU).model, "glean/CLAUDE_5_5_OPUS");
  assert.equal(pickVerifier(plan, "anthropic/claude-x", TAU).model, "glean/GPT6_1_SOL");
  // A second verifier for a blocker: not the first one again.
  const second = pickVerifier(plan, "glean/GPT6_1_SOL", TAU, ["glean/CLAUDE_5_5_OPUS"]);
  assert.notEqual(second.model, "glean/CLAUDE_5_5_OPUS");
  assert.notEqual(second.family, "openai", "still not the author's family");
  const exhausted = pickVerifier(plan, "glean/GPT6_1_SOL", { hosts: { tau: { strong: ["glean/CLAUDE_5_5_OPUS", "glean/GPT6_1_SOL"] } } }, ["glean/CLAUDE_5_5_OPUS"]);
  assert.equal(exhausted.model, null);
  assert.match(exhausted.note, /no other model/);
  assert.equal(pickTiebreak(plan, ["glean/CLAUDE_5_5_OPUS", "glean/GPT6_1_SOL"], TAU).model, "glean/GROK_4_7");
  const noThird = { hosts: { tau: { strong: TAU.hosts.tau.strong } } };
  const p2 = resolvePlan({ depth: "standard", lenses: ["correctness"], host: "tau", config: noThird });
  assert.equal(pickTiebreak(p2, ["glean/CLAUDE_5_5_OPUS", "glean/GPT6_1_SOL"], noThird).model, null);
});

test("config checks and host detection", () => {
  assert.throws(() => checkUserConfig({ depth: "max" }), /depth must be one of/);
  assert.throws(() => checkUserConfig({ hosts: { tau: { cheap: ["x/y"] } } }), /not a tier/);
  assert.throws(() => checkUserConfig({ hosts: { tau: { fast: "glean/X" } } }), /list of provider\/model IDs/);
  assert.throws(() => checkUserConfig({ hosts: { "claude-code": { strong: ["opus"] } } }), /provider\/model/, "a bare name would count as its own family");
  assert.deepEqual(checkRepoConfig({}), { depth: null, deepPaths: [] });
  assert.throws(() => checkRepoConfig({ review: { deepPaths: "src/**" } }), /list of path globs/);
  assert.equal(detectHost({ PI_SESSION_ID: "x" }), "tau");
  assert.equal(detectHost({ CLAUDECODE: "1" }), "claude-code");
  assert.equal(detectHost({ PI_SESSION_ID: "x", CLAUDECODE: "1" }), "claude-code", "Claude Code started from a Tau shell is Claude Code");
  assert.equal(detectHost({}), null);
});

test("ledger records depth per round, and the summary breaks findings down by depth and model", () => {
  const l = { schema: ledger.SCHEMA, repo: "o/r", key: "1", rounds: [], findings: [] };
  ledger.startRound(l, { base: "b", head: "h", lenses: ["correctness"], depth: "quick" });
  ledger.recordRun(l, { lens: "correctness", model: "glean/GPT5_4_MINI" });
  ledger.addFindings(l, [{ lens: "correctness", model: "glean/GPT5_4_MINI", file: "a.js", line: 1, title: "t", precondition: "p", scenario: "s" }]);
  ledger.decide(l, "F1", "finding-verification", { label: "confirmed", probability: 0.9 });
  ledger.report(l);
  ledger.dispose(l, "F1", "wrong");
  const s = ledger.summarize([l]);
  assert.deepEqual(s.byDepth.quick, { reported: 1, disposed: 1, fixed: 0, noise: 1, noiseRate: 1 });
  assert.equal(s.byModel["glean/GPT5_4_MINI"].noiseRate, 1);
  assert.throws(() => ledger.startRound(l, { base: "b", head: "h", depth: "huge" }), /--depth must be/);
});

test("pin: repo depth and deep paths come from the merge base, and a follow-up keeps the PR's depth", () => {
  const root = mkdtempSync(join(tmpdir(), "depth-"));
  const repo = join(root, "repo");
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" }).trim();
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(repo, "agent-review.json"), JSON.stringify({ review: { depth: "standard", deepPaths: ["src/auth/**"] } }));
  mkdirSync(join(repo, "src", "auth"), { recursive: true });
  writeFileSync(join(repo, "src", "auth", "token.js"), "1\n");
  writeFileSync(join(repo, "src", "a.js"), "1\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "feature");
  writeFileSync(join(repo, "src", "a.js"), "2\n");
  // The change tries to lower its own review. pin must read the base copy.
  writeFileSync(join(repo, "agent-review.json"), JSON.stringify({ review: { depth: "quick", deepPaths: [] } }));
  git("commit", "-qam", "change a, lower review");
  const config = join(root, "config.json");
  writeFileSync(config, JSON.stringify(TAU));
  const env = { ...process.env, AGENT_REVIEWS_CONFIG: config, PATH: process.env.PATH };
  delete env.PI_SESSION_ID;
  const pin = (...args) => {
    const r = spawnSync("node", [CLI, "pin", "--base", "main", "--host", "tau", ...args], { cwd: repo, env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };

  const first = pin();
  assert.deepEqual([first.depth, first.depthSource], ["standard", "agent-review.json"]);
  assert.ok(first.rulesChanged.includes("agent-review.json"));
  assert.equal(first.plan.host, "tau");
  assert.equal(first.plan.reviewers.find((r) => r.lens === "correctness").model, "glean/CLAUDE_5_5_OPUS");
  assert.deepEqual(pin("--depth", "quick").plan.reviewers.map((r) => r.tier), ["fast", "fast", "fast"]);

  // A later commit touches a deep path, then a follow-up pins only the newest commit.
  writeFileSync(join(repo, "src", "auth", "token.js"), "2\n");
  git("commit", "-qam", "touch auth");
  const touched = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "src", "a.js"), "3\n");
  git("commit", "-qam", "change a again");
  assert.equal(pin("--depth", "quick").depth, "deep", "a deep path raises an explicit quick");
  const followUp = pin("--since", touched);
  assert.equal(followUp.depth, "deep", "the follow-up diff misses src/auth, but the PR touches it");
  assert.equal(followUp.files, 1);

  const ctx = join(root, "ctx");
  pin("--out", ctx);
  const plan = (...a) => JSON.parse(execFileSync("node", [CLI, "plan", ...a, "--context", ctx], { env, encoding: "utf8" }));
  assert.equal(plan("verifier", "--author", "glean/CLAUDE_5_5_OPUS").model, "glean/GPT6_1_SOL");
  assert.equal(plan("tiebreak", "--exclude", "glean/CLAUDE_5_5_OPUS,glean/GPT6_1_SOL").model, "glean/GROK_4_7");
  assert.equal(plan("show").depth, "deep");

  // A name git would quote (non-ASCII) still matches deepPaths.
  git("checkout", "-q", "main");
  git("checkout", "-q", "-b", "unicode");
  writeFileSync(join(repo, "src", "auth", "caf\u00e9.js"), "1\n");
  git("add", "-A");
  git("commit", "-qm", "add a non-ASCII name under auth");
  const unicode = pin();
  assert.equal(unicode.depth, "deep", unicode.depthSource);
  assert.match(unicode.depthSource, /src\/auth\/caf\u00e9\.js/);

  // A broken agent-review.json at the base names the file.
  writeFileSync(join(repo, "agent-review.json"), "{ \"review\": { \"depth\": \"deep\", } }");
  git("commit", "-qam", "break the config");
  git("checkout", "-q", "-b", "after-broken");
  writeFileSync(join(repo, "src", "a.js"), "9\n");
  git("commit", "-qam", "change");
  const r = spawnSync("node", [CLI, "pin", "--base", "unicode", "--host", "tau"], { cwd: repo, env, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /agent-review\.json at [0-9a-f]{7}: /);

  // A version 1 policy, as the review harness reads it: minDepth is a floor.
  const v1 = (policy, name) => {
    git("checkout", "-q", "main");
    git("checkout", "-q", "-b", `${name}-base`);
    writeFileSync(join(repo, "agent-review.json"), JSON.stringify(policy));
    git("commit", "-qam", `policy ${name}`);
    git("checkout", "-q", "-b", name);
    writeFileSync(join(repo, "README.md"), `${name}\n`);
    git("add", "-A");
    git("commit", "-qm", "docs only");
    return spawnSync("node", [CLI, "pin", "--base", `${name}-base`, "--host", "tau"], { cwd: repo, env, encoding: "utf8" });
  };
  const floored = v1({ version: 1, review: { minDepth: "standard" } }, "floor");
  assert.equal(floored.status, 0, floored.stderr);
  assert.deepEqual([JSON.parse(floored.stdout).depth, JSON.parse(floored.stdout).depthSource], ["standard", "agent-review.json minDepth (raised from quick)"]);
  const unknown = v1({ version: 1, review: { minDepht: "deep" } }, "typo");
  assert.notEqual(unknown.status, 0, "a setting the harness does not know is an error, not ignored");
  assert.match(unknown.stderr, /review\.minDepht/);
});
