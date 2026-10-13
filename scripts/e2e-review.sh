#!/bin/sh
# End-to-end check of review-my-changes against a fixture repo. Not run in CI:
# it needs logged-in claude and codex CLIs and takes several minutes.
#
# Builds a small library with two branches off main:
#   seeded  three planted bugs, with the intent stated in the commit message
#   clean   a correct change (the control)
# runs Claude Code with the plugin on each, and checks the ledger:
#   - seeded: each planted bug is reported (file and line within 3 lines)
#   - clean:  no blockers are reported
#   - both:   every chosen lens ran, at least two model families reviewed or
#             verified, and nothing merged
#
# Usage: scripts/e2e-review.sh [seeded] [clean]
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
repo="$work/repo"
export SCALVERT_STATE_DIR="$work/state"
export LEDGER_MODULE="$here/shared/scalvert/scripts/review-ledger.mjs"
mkdir -p "$repo" "$SCALVERT_STATE_DIR"
cd "$repo"

git init -q -b main
git config user.email e2e@example.com
git config user.name e2e
mkdir -p src test .claude
node "$here/shared/scalvert/scripts/permissions.mjs" preset draft-pr > .claude/settings.json
cat > AGENTS.md <<'EOF'
# AGENTS.md

## Development

- Test: `node --test test/`
EOF
cat > package.json <<'EOF'
{ "name": "fixture-lib", "version": "1.0.0", "type": "module" }
EOF
cat > src/paginate.js <<'EOF'
// Returns page `page` (1-based) of `items`, `size` items per page.
export function paginate(items, page, size) {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}
EOF
cat > src/store.js <<'EOF'
import { writeFile } from "node:fs/promises";

export async function save(path, record) {
  await writeFile(path, JSON.stringify(record));
  return true;
}
EOF
cat > src/query.js <<'EOF'
// Builds a parameterized lookup. Callers pass the values to the driver.
export function findUser(name) {
  return { sql: "SELECT * FROM users WHERE name = ?", params: [name] };
}
EOF
cat > test/paginate.test.js <<'EOF'
import { test } from "node:test";
import assert from "node:assert/strict";
import { paginate } from "../src/paginate.js";
test("first page", () => assert.deepEqual(paginate([1, 2, 3, 4], 1, 2), [1, 2]));
EOF
git add -A && git commit -q -m "base library"

# seeded: three planted bugs.
git checkout -q -b seeded
cat > src/paginate.js <<'EOF'
// Returns page `page` (1-based) of `items`, `size` items per page.
export function paginate(items, page, size) {
  const start = page * size;
  return items.slice(start, start + size);
}
EOF
cat > src/store.js <<'EOF'
import { writeFile } from "node:fs/promises";

// Saves a record and reports whether the write succeeded.
export async function save(path, record) {
  writeFile(path, JSON.stringify(record));
  return true;
}
EOF
cat > src/query.js <<'EOF'
// Builds the lookup for a user name, with an optional role filter.
export function findUser(name, role) {
  let sql = "SELECT * FROM users WHERE name = '" + name + "'";
  if (role) sql += " AND role = ?";
  return { sql, params: role ? [role] : [] };
}
EOF
git commit -qam "Add role filter to findUser and tidy pagination and save

findUser takes an optional role. Pagination and save keep their behavior."
git checkout -q main

# clean: a correct change.
git checkout -q -b clean
cat > src/paginate.js <<'EOF'
// Returns page `page` (1-based) of `items`, `size` items per page.
// A page or size below 1 returns an empty page.
export function paginate(items, page, size) {
  if (page < 1 || size < 1) return [];
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}
EOF
cat > test/paginate.test.js <<'EOF'
import { test } from "node:test";
import assert from "node:assert/strict";
import { paginate } from "../src/paginate.js";
test("first page", () => assert.deepEqual(paginate([1, 2, 3, 4], 1, 2), [1, 2]));
test("second page", () => assert.deepEqual(paginate([1, 2, 3, 4], 2, 2), [3, 4]));
test("bad page", () => assert.deepEqual(paginate([1, 2], 0, 2), []));
EOF
git commit -qam "Return an empty page for a page or size below 1"
git checkout -q main
git update-ref refs/remotes/origin/main main
git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main

prompt='Use the review-my-changes skill on the current branch against origin/main. The repo has no GitHub remote, so use repo name "fixture/lib" for the ledger. Do not ask me questions; make reasonable choices and finish the whole skill, including the report.'
status=0

for branch in ${*:-seeded clean}; do
  git checkout -q "$branch"
  before=$(git rev-parse HEAD)
  claude -p --permission-mode acceptEdits \
    --allowedTools "Bash Read Edit Write Grep Glob Agent Task" \
    --plugin-dir "$here/plugins/claude/scalvert" "$prompt" > "$work/$branch.out" 2>&1 || true
  ledger="$SCALVERT_STATE_DIR/reviews/fixture/lib/$branch.json"
  echo "== $branch"
  if [ ! -f "$ledger" ]; then
    echo "FAIL: no ledger at $ledger (see $work/$branch.out)"
    status=1
    continue
  fi
  node - "$ledger" "$branch" "$before" "$repo" <<'EOF' || status=1
const [ledgerPath, branch, before, repo] = process.argv.slice(2);
const { readFileSync } = await import("node:fs");
const { execFileSync } = await import("node:child_process");
const l = JSON.parse(readFileSync(ledgerPath, "utf8"));
const reported = l.findings.filter((f) => f.reported);
const { roundFamilies } = await import(process.env.LEDGER_MODULE);
const families = new Set(roundFamilies(l, l.rounds.at(-1).round));
const runs = l.rounds.at(-1).runs ?? [];
console.log(`runs: ${runs.map((r) => `${r.lens}@${r.model}`).join(", ") || "none"}`);
const sev = (f) => f.decisions["finding-severity"]?.label;
let ok = true;
const say = (pass, msg) => { console.log(`${pass ? "PASS" : "FAIL"}: ${msg}`); ok &&= pass; };
console.log(`findings ${l.findings.length}, reported ${reported.length}, families ${[...families].join(", ")}`);
for (const f of reported) console.log(`  ${f.id} ${sev(f) ?? "?"} ${f.file}:${f.line} ${f.title}`);
say(families.size >= 2, "two or more model families reviewed or verified");
say(l.rounds.at(-1).lenses.every((lens) => runs.some((r) => r.lens === lens)), "every chosen lens has a recorded run");
say(reported.every((f) => f.decisions["finding-verification"]?.probability >= 0.7), "every reported finding passed the verification gate");
if (branch === "seeded") {
  const planted = [["src/paginate.js", 3], ["src/store.js", 5], ["src/query.js", 3]];
  for (const [file, line] of planted) {
    const hit = reported.some((f) => f.file.endsWith(file) && (f.line == null || Math.abs(f.line - line) <= 3));
    say(hit, `planted bug reported: ${file}:${line}`);
  }
} else {
  say(!reported.some((f) => sev(f) === "blocker"), "control branch has no blockers");
}
const log = execFileSync("git", ["log", "--format=%s", `${before}..HEAD`], { cwd: repo, encoding: "utf8" }).trim();
console.log(`commits added: ${log ? log.split("\n").join(" | ") : "none"}`);
const merged = execFileSync("git", ["branch", "--merged", "main"], { cwd: repo, encoding: "utf8" });
say(!merged.split("\n").some((b) => b.trim().replace("* ", "") === branch), "branch was not merged into main");
process.exit(ok ? 0 : 1);
EOF
done

echo "work dir: $work"
exit $status
