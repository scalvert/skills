// Pins the contracts that other tools and stored state depend on, before the
// review harness replaces the internals: the command surface, the v1 ledger
// file shape, and the ledger file path. A change here is a compatibility
// change; update the expectation on purpose, and say so in the PR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProgram } from "../cli/src/cli.mjs";

const CLI = new URL("../shared/scalvert/scripts/agent-review.mjs", import.meta.url).pathname;

function surface() {
  const out = [];
  const walk = (cmd, prefix) => {
    for (const sub of cmd.commands) {
      const path = [...prefix, sub.name()];
      if (sub.commands.length) {
        walk(sub, path);
        continue;
      }
      const args = sub.registeredArguments.map((a) => (a.required ? `<${a.name()}>` : `[${a.name()}${a.variadic ? "..." : ""}]`));
      const flags = sub.options.map((o) => o.long).filter(Boolean).sort();
      out.push([...path, ...args, ...flags].join(" "));
    }
  };
  walk(buildProgram(), []);
  return out;
}

test("the command surface: every command, argument and flag", () => {
  assert.deepEqual(surface(), [
    "pin --base --depth --host --out --pr --since",
    "plan show --context",
    "plan verifier --author --context --exclude",
    "plan tiebreak --context --exclude",
    "plan config",
    "lens prompt <lens> --context",
    "lens run <lens> --context --model --repo-dir --via",
    "ledger path --key --repo",
    "ledger start --base --depth --head --key --lenses --models --past-cap --repo",
    "ledger add --file --key --repo",
    "ledger decide --id --json --key --kind --repo",
    "ledger ran --findings --key --lens --model --repo",
    "ledger merge --ids --into --key --repo",
    "ledger report --allow-missing --keep --key --repo --threshold",
    "ledger dispose --actor --as --id --key --note --note-file --repo",
    "ledger link --id --key --repo --thread --url",
    "ledger open --key --repo",
    "ledger last-head --key --repo",
    "ledger summary --key --repo",
    // Added with the review harness: a read-only view of harness reviews, and
    // the harness's own commands, which take their arguments unparsed.
    "findings report --key --repo",
    "findings open --key --repo",
    "findings last-head --key --repo",
    "review",
    "eligibility",
    "merge",
    "inbox",
    "rubric list",
    "rubric show <kind>",
    "rubric check <kind> <json>",
    "policy preset <name>",
    "policy check [command...] --json --settings --tool",
    "policy lint --settings",
    "policy compile --codex --settings",
    "policy shim <dir>",
    "threads list --all --pr --repo",
    "threads owner --line --path --repo",
    "prose [files...] --github --json",
  ]);
});

function harness() {
  const state = mkdtempSync(join(tmpdir(), "contracts-"));
  const env = { ...process.env, AGENT_REVIEWS_STATE_DIR: state };
  // Most commands print JSON; `ledger path` prints the bare path.
  const cli = (...args) => {
    const out = execFileSync("node", [CLI, ...args], { env, encoding: "utf8" }).trim();
    try {
      return JSON.parse(out);
    } catch {
      return out;
    }
  };
  return { state, env, cli };
}

const finding = (n) => ({
  lens: "correctness",
  model: "anthropic/opus",
  file: `src/f${n}.js`,
  line: n,
  title: `finding ${n}`,
  precondition: "p",
  scenario: "s",
  evidence: "e",
});

test("the v1 ledger file: schema, path and the keys of every record", () => {
  const { state, cli } = harness();
  const K = ["--repo", "acme/widgets", "--key", "feat/x"];
  const path = cli("ledger", "path", ...K);
  assert.equal(path, join(state, "reviews", "acme", "widgets", "feat%2Fx.json"));

  cli("ledger", "start", ...K, "--base", "a".repeat(40), "--head", "b".repeat(40), "--lenses", "correctness,tests", "--depth", "standard");
  cli("ledger", "ran", ...K, "--lens", "correctness", "--model", "anthropic/opus", "--findings", "2");
  const file = join(state, "f.json");
  writeFileSync(file, JSON.stringify([finding(1), finding(2)]));
  cli("ledger", "add", ...K, "--file", file);
  cli("ledger", "decide", ...K, "--id", "F1", "--kind", "finding-verification", "--json", JSON.stringify({ label: "confirmed", probability: 0.9, rationale: "r", model: "openai/gpt-5.5" }));
  cli("ledger", "merge", ...K, "--into", "F1", "--ids", "F2");
  cli("ledger", "dispose", ...K, "--id", "F1", "--as", "fixed", "--note", "n");
  cli("ledger", "link", ...K, "--id", "F1", "--thread", "T1", "--url", "https://example.com/t/1");

  const l = JSON.parse(readFileSync(path, "utf8"));
  const keys = (o) => Object.keys(o).sort();
  assert.equal(l.schema, "scalvert.review/v1");
  assert.deepEqual(keys(l), ["findings", "key", "repo", "rounds", "schema"]);
  assert.deepEqual(keys(l.rounds[0]), ["base", "depth", "head", "lenses", "models", "round", "runs", "startedAt"]);
  assert.deepEqual(keys(l.rounds[0].runs[0]), ["at", "findings", "lens", "model"]);
  assert.deepEqual(keys(l.findings[0]), [
    "axiom", "class", "decisions", "disposition", "evidence", "file", "id", "instances",
    "lens", "line", "model", "precondition", "reported", "round", "scenario", "thread", "title",
  ]);
  assert.deepEqual(keys(l.findings[1]), [
    "axiom", "class", "decisions", "disposition", "duplicateOf", "evidence", "file", "id", "instances",
    "lens", "line", "model", "precondition", "reported", "round", "scenario", "title",
  ]);
  assert.deepEqual(keys(l.findings[0].decisions["finding-verification"]), ["at", "backend", "kind", "label", "model", "probability", "rationale"]);
  assert.deepEqual(keys(l.findings[0].disposition), ["as", "at", "note"]);
  assert.equal(l.findings[1].duplicateOf, "F1");
});
