import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// These tests run the built bundle, which is what the skills ship. `npm test`
// rebuilds it first, and check:fresh fails when the committed copy is stale.
const SCRIPTS = new URL("../shared/scalvert/scripts/", import.meta.url).pathname;
const CLI = join(SCRIPTS, "agent-review.mjs");
const cli = (args, opts = {}) => spawnSync("node", [CLI, ...args], { encoding: "utf8", ...opts });

test("every command group prints help and exits 0", () => {
  const groups = { lens: ["prompt", "run"], ledger: ["start", "report", "summary"], rubric: ["list", "show", "check"], policy: ["check", "compile", "shim"], threads: ["list", "owner"] };
  for (const [group, subs] of Object.entries(groups)) {
    const r = cli([group, "--help"]);
    assert.equal(r.status, 0, r.stderr);
    for (const sub of subs) assert.match(r.stdout, new RegExp(`^  ${sub}\\b`, "m"), `${group} --help lists ${sub}`);
  }
  for (const top of ["pin", "prose"]) assert.equal(cli([top, "--help"]).status, 0);
});

test("usage errors exit 2, like the scripts it replaced", () => {
  const cases = [
    ["nope"],
    ["ledger"],
    ["ledger", "report", "--repo", "o/r"],
    ["ledger", "start", "--repo", "o/r", "--key", "1", "--bogus", "x"],
    ["lens", "run", "tests", "--via", "gemini", "--context", "/tmp"],
    ["rubric", "show", "no-such-kind"],
    ["policy", "preset", "no-such-preset"],
    ["policy", "check"],
  ];
  for (const args of cases) {
    const r = cli(args);
    assert.equal(r.status, 2, `${args.join(" ")} -> ${r.status}: ${r.stderr}`);
    assert.notEqual(r.stderr.trim(), "", `${args.join(" ")} explains itself on stderr`);
  }
});

test("a failed command names itself on stderr", () => {
  const r = cli(["rubric", "show", "no-such-kind"]);
  assert.match(r.stderr, /^agent-review rubric show: unknown kind "no-such-kind"/);
});

test("policy check takes the command after --, or bare words with their own flags", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-policy-"));
  const settings = join(dir, "settings.json");
  writeFileSync(settings, JSON.stringify({ permissions: { allow: ["Bash(gh pr merge *)"], deny: ["Bash(git push --force *)"] } }));
  assert.equal(cli(["policy", "check", "--settings", settings, "--", "gh", "pr", "merge", "1", "--admin"]).stdout.trim(), "allow");
  assert.equal(cli(["policy", "check", "--settings", settings, "git", "push", "--force", "origin"]).stdout.trim(), "deny");
});

test("the bundle reads lens prompts from the lenses folder beside it", () => {
  const ctx = mkdtempSync(join(tmpdir(), "cli-lens-"));
  writeFileSync(join(ctx, "diff.patch"), "+x\n");
  for (const lens of readdirSync(join(SCRIPTS, "lenses")).map((f) => f.replace(/\.md$/, ""))) {
    const r = cli(["lens", "prompt", lens, "--context", ctx]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Report a finding only when all of these are true/);
  }
});

test("shims written by the bundle call the bundled guard, the path installed shims already use", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-shim-"));
  const r = cli(["policy", "shim", join(dir, "shims")]);
  assert.equal(r.status, 0, r.stderr);
  const body = readFileSync(join(dir, "shims", "gh"), "utf8");
  assert.ok(body.includes(JSON.stringify(join(SCRIPTS, "guard.mjs"))), body);
});

test("shim refuses to write shims that point at a missing guard", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-noguard-"));
  const skillScripts = new URL("../shared/scalvert/skills/code-review/scripts/agent-review.mjs", import.meta.url).pathname;
  const r = spawnSync("node", [skillScripts, "policy", "shim", join(dir, "shims")], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no guard at/);
});

test("every agent-review command named in a skill or partial exists", async () => {
  const root = new URL("../", import.meta.url).pathname;
  const files = [
    ...readdirSync(join(root, "partials")).map((f) => join(root, "partials", f)),
    ...readdirSync(join(root, "shared/scalvert/skills")).map((s) => join(root, "shared/scalvert/skills", s, "SKILL.md")),
  ];
  const seen = new Set();
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(/agent-review\.mjs((?: [a-z][a-z-]*)+)/g)) seen.add(m[1].trim());
  }
  assert.ok(seen.size >= 10, `found ${seen.size} commands`);
  // Walk the commander tree: while a command has subcommands, the next word
  // must name one. Words after a leaf are its arguments (a lens, a kind, a file).
  const { buildProgram } = await import("../cli/src/cli.mjs");
  for (const command of seen) {
    let node = buildProgram();
    for (const word of command.split(" ")) {
      if (node.commands.length === 0) break;
      const next = node.commands.find((c) => c.name() === word);
      assert.ok(next, `"${command}": "${word}" is not a subcommand of "${node.name()}"`);
      node = next;
    }
    assert.equal(node.commands.length, 0, `"${command}" names a group, not a command`);
  }
});

test("every skill gets an identical copy of the bundle", () => {
  const bundle = readFileSync(CLI, "utf8");
  const skills = new URL("../shared/scalvert/skills/", import.meta.url).pathname;
  const manifest = JSON.parse(readFileSync(new URL("../shared/scalvert/skill-scripts.json", import.meta.url), "utf8"));
  for (const skill of Object.keys(manifest)) {
    assert.equal(readFileSync(join(skills, skill, "scripts", "agent-review.mjs"), "utf8"), bundle, skill);
  }
});

test("prose --github exits 1 on code outside backticks and 0 once it is formatted", () => {
  const bad = cli(["prose", "--github"], { input: "F1: listThreads() in src/page.js:12 is off by one.\n" });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /finding ID: F1/);
  assert.match(bad.stdout, /unformatted code \(call\): listThreads\(\)/);
  const good = cli(["prose", "--github"], { input: "`listThreads()` in `src/page.js:12` is off by one.\n" });
  assert.equal(good.status, 0, good.stdout);
});

test("prose reads stdin and exits 1 on a flag", () => {
  mkdirSync(join(tmpdir(), "cli-prose"), { recursive: true });
  assert.equal(cli(["prose"], { input: "Plain words.\n" }).status, 0);
  assert.equal(cli(["prose"], { input: "We delve into it.\n" }).status, 1);
});

test("the bundle carries commander's full MIT license text", () => {
  const head = readFileSync(CLI, "utf8").slice(0, 3000);
  assert.match(head, /includes commander \d+\.\d+\.\d+/);
  assert.match(head, /Permission is hereby granted, free of charge/);
  assert.match(head, /THE SOFTWARE IS PROVIDED 'AS IS'/);
});

test("policy shim help names every shim it writes", () => {
  const help = cli(["policy", "shim", "--help"]).stdout;
  for (const name of ["gh", "git", "npm", "pnpm", "yarn"]) assert.match(help, new RegExp(`\\b${name}\\b`));
});

test("ledger link saves a thread that ledger open returns, and dispose reads notes from a file or stdin", () => {
  const env = { ...process.env, AGENT_REVIEWS_STATE_DIR: mkdtempSync(join(tmpdir(), "cli-link-")) };
  const key = ["--repo", "o/r", "--key", "5"];
  const run = (args, input) => {
    const r = cli(["ledger", ...args, ...key], { env, input });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  run(["start", "--base", "b", "--head", "h", "--lenses", "correctness"]);
  run(["ran", "--lens", "correctness", "--model", "glean/GPT6_1_SOL"]);
  const finding = (line) => ({ lens: "correctness", file: "src/a.js", line, title: "t", precondition: "p", scenario: "s" });
  run(["add"], JSON.stringify([finding(1), finding(50), finding(90)]));
  for (const id of ["F1", "F2", "F3"]) run(["decide", "--id", id, "--kind", "finding-verification", "--json", '{"label":"confirmed","probability":0.9}']);
  run(["report"]);
  run(["link", "--id", "F1", "--thread", "PRRT_abc", "--url", "https://github.com/o/r/pull/5#discussion_r1"]);
  const open = run(["open"]);
  assert.deepEqual(
    { id: open[0].id, thread: open[0].thread.id, url: open[0].thread.url },
    { id: "F1", thread: "PRRT_abc", url: "https://github.com/o/r/pull/5#discussion_r1" },
  );

  // Text copied from GitHub goes through a file or stdin, never a shell string.
  const reply = "Intended: the cursor counts as an item. $(touch /tmp/should-not-run)";
  const file = join(mkdtempSync(join(tmpdir(), "note-")), "reason.txt");
  writeFileSync(file, `${reply}\n`);
  run(["dispose", "--id", "F1", "--as", "intended", "--note-file", file]);
  run(["dispose", "--id", "F2", "--as", "wrong", "--note-file", "-"], reply);
  const both = cli(["ledger", "dispose", ...key, "--id", "F3", "--as", "wrong", "--note", "x", "--note-file", file], { env });
  assert.notEqual(both.status, 0);
  assert.match(both.stderr, /--note or --note-file, not both/);
  const path = cli(["ledger", "path", ...key], { env }).stdout.trim();
  const saved = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(saved.findings.slice(0, 2).map((f) => f.disposition.note), [reply, reply]);
});
