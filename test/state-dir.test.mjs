import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stateDir, ledgerPath } from "../shared/scalvert/scripts/review-ledger.mjs";

let home;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "state-dir-home-"));
  process.env.HOME = home;
  delete process.env.AGENT_REVIEWS_STATE_DIR;
  delete process.env.SCALVERT_STATE_DIR;
  delete process.env.XDG_STATE_HOME;
});

test("stateDir defaults to ~/.local/state/agent-reviews", () => {
  assert.equal(stateDir(), join(home, ".local", "state", "agent-reviews"));
});

test("stateDir honors XDG_STATE_HOME", () => {
  process.env.XDG_STATE_HOME = join(home, "xdg");
  assert.equal(stateDir(), join(home, "xdg", "agent-reviews"));
});

test("AGENT_REVIEWS_STATE_DIR wins, then the old SCALVERT_STATE_DIR", () => {
  process.env.SCALVERT_STATE_DIR = "/old";
  assert.equal(stateDir(), "/old");
  process.env.AGENT_REVIEWS_STATE_DIR = "/new";
  assert.equal(stateDir(), "/new");
});

test("ledgers from before the rename stay in use until the new dir exists", () => {
  const legacy = join(home, ".local", "state", "scalvert");
  mkdirSync(join(legacy, "reviews"), { recursive: true });
  assert.equal(stateDir(), legacy);
  mkdirSync(join(home, ".local", "state", "agent-reviews"), { recursive: true });
  assert.equal(stateDir(), join(home, ".local", "state", "agent-reviews"));
});

test("an old dir without reviews does not count as legacy ledgers", () => {
  mkdirSync(join(home, ".local", "state", "scalvert", "archive"), { recursive: true });
  assert.equal(stateDir(), join(home, ".local", "state", "agent-reviews"));
});

test("legacy ledgers stay in use when XDG_STATE_HOME points elsewhere", () => {
  mkdirSync(join(home, ".local", "state", "scalvert", "reviews"), { recursive: true });
  process.env.XDG_STATE_HOME = join(home, "xdg");
  assert.equal(stateDir(), join(home, ".local", "state", "scalvert"));
});

test("empty env vars are ignored", () => {
  process.env.AGENT_REVIEWS_STATE_DIR = "";
  process.env.SCALVERT_STATE_DIR = "";
  assert.equal(stateDir(), join(home, ".local", "state", "agent-reviews"));
});

test("ledgerPath uses the legacy dir until the new dir exists", () => {
  mkdirSync(join(home, ".local", "state", "scalvert", "reviews"), { recursive: true });
  assert.ok(ledgerPath("o/r", "7").startsWith(join(home, ".local", "state", "scalvert", "reviews")));
  mkdirSync(join(home, ".local", "state", "agent-reviews"), { recursive: true });
  assert.ok(ledgerPath("o/r", "7").startsWith(join(home, ".local", "state", "agent-reviews", "reviews")));
});
