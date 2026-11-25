// The ledger lock, tested without timing races: the test holds the lock
// itself and checks what a writer does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const CLI = new URL("../shared/scalvert/scripts/agent-review.mjs", import.meta.url).pathname;
const K = ["--repo", "acme/widgets", "--key", "9"];

function setup() {
  const state = mkdtempSync(join(tmpdir(), "lock-"));
  const env = { ...process.env, AGENT_REVIEWS_STATE_DIR: state };
  const run = (...args) => execFileSync("node", [CLI, ...args], { env, encoding: "utf8" }).trim();
  run("ledger", "start", ...K, "--base", "a".repeat(40), "--head", "b".repeat(40), "--lenses", "correctness");
  const path = run("ledger", "path", ...K);
  const file = join(state, "f.json");
  writeFileSync(file, JSON.stringify([{ lens: "correctness", model: "anthropic/opus", file: "a.js", line: 1, title: "t", precondition: "p", scenario: "s", evidence: "e" }]));
  return { state, env, path, lock: `${path}.lock`, file };
}

const findings = (path) => JSON.parse(readFileSync(path, "utf8")).findings.length;

test("a held lock: the writer gives up with 'ledger busy' and writes nothing", () => {
  const { env, path, lock, file } = setup();
  writeFileSync(lock, JSON.stringify({ pid: process.pid, id: "test" }));
  const r = spawnSync("node", [CLI, "ledger", "add", ...K, "--file", file], {
    env: { ...env, AGENT_REVIEWS_LOCK_TIMEOUT_MS: "200" },
    encoding: "utf8",
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ledger busy/);
  assert.equal(findings(path), 0);
  assert.ok(existsSync(lock), "the other writer's lock is left alone");
});

test("a held lock: the writer waits, then commits once the lock is released", async () => {
  const { env, path, lock, file } = setup();
  writeFileSync(lock, JSON.stringify({ pid: process.pid, id: "test" }));
  const started = Date.now();
  const done = new Promise((resolve) => spawn("node", [CLI, "ledger", "add", ...K, "--file", file], { env }).on("close", resolve));
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(findings(path), 0, "nothing is written while the lock is held");
  rmSync(lock);
  assert.equal(await done, 0);
  assert.ok(Date.now() - started >= 400);
  assert.equal(findings(path), 1);
  assert.ok(!existsSync(lock), "the writer removes its own lock");
});

test("a lock left by a crashed writer is recovered", () => {
  const { env, path, lock, file } = setup();
  const gone = spawnSync("node", ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" }).stdout;
  writeFileSync(lock, JSON.stringify({ pid: Number(gone), id: "crashed" }));
  execFileSync("node", [CLI, "ledger", "add", ...K, "--file", file], { env });
  assert.equal(findings(path), 1);
  assert.ok(!existsSync(lock));
});

test("a lock held by a live process is never removed, however old: the writer reports busy", () => {
  const { env, path, lock, file } = setup();
  writeFileSync(lock, JSON.stringify({ pid: process.pid, id: "old" }));
  const old = new Date(Date.now() - 60_000);
  utimesSync(lock, old, old);
  const r = spawnSync("node", [CLI, "ledger", "add", ...K, "--file", file], { env: { ...env, AGENT_REVIEWS_LOCK_TIMEOUT_MS: "200" }, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ledger busy/);
  assert.ok(existsSync(lock));
  assert.equal(findings(path), 0);
});

test("an old lock with no readable PID is recovered, and only the breaker's holder reclaims", () => {
  const { env, path, lock, file } = setup();
  writeFileSync(lock, "");
  const old = new Date(Date.now() - 60_000);
  utimesSync(lock, old, old);
  // A live waiter holds the breaker: this writer leaves the lock alone.
  writeFileSync(`${lock}.break`, JSON.stringify({ pid: process.pid, id: "breaker" }));
  const r = spawnSync("node", [CLI, "ledger", "add", ...K, "--file", file], { env: { ...env, AGENT_REVIEWS_LOCK_TIMEOUT_MS: "200" }, encoding: "utf8" });
  assert.match(r.stderr, /ledger busy/);
  assert.ok(existsSync(lock));
  // That waiter crashed: its breaker is cleared, then the stale lock.
  const gone = spawnSync("node", ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" }).stdout;
  writeFileSync(`${lock}.break`, JSON.stringify({ pid: Number(gone), id: "breaker" }));
  execFileSync("node", [CLI, "ledger", "add", ...K, "--file", file], { env });
  assert.equal(findings(path), 1);
  assert.ok(!existsSync(`${lock}.break`));
});

// Agents record runs and findings in parallel. Before the lock, 40 parallel
// writers lost or failed 3 to 6 writes per run. Every write must land.
test("parallel ledger writes: none is lost", async () => {
  const { state, env, path } = setup();
  const N = 40;
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) => {
      const f = join(state, `f${i}.json`);
      writeFileSync(f, JSON.stringify([{ lens: "correctness", model: "anthropic/opus", file: `f${i}.js`, line: 1, title: `t${i}`, precondition: "p", scenario: "s", evidence: "e" }]));
      return new Promise((resolve) => {
        const child = spawn("node", [CLI, "ledger", "add", ...K, "--file", f], { env });
        let stderr = "";
        child.stderr.on("data", (d) => (stderr += d));
        child.on("close", (code) => resolve({ code, stderr }));
      });
    }),
  );
  assert.deepEqual(results.filter((r) => r.code !== 0), [], "no writer fails");
  const l = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(l.findings.length, N, "every finding is kept");
  assert.equal(new Set(l.findings.map((f) => f.id)).size, N, "IDs stay unique");
});

test("a failed change saves nothing and releases the lock", () => {
  const { env, path, lock } = setup();
  const r = spawnSync("node", [CLI, "ledger", "decide", ...K, "--id", "F9", "--kind", "finding-verification", "--json", "{}"], { env, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.ok(!existsSync(lock));
  assert.deepEqual(
    readdirSync(dirname(path)).filter((n) => n.endsWith(".tmp")),
    [],
    "no temp files are left behind",
  );
  assert.equal(findings(path), 0);
});
