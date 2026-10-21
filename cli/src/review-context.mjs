// Pins everything a review needs into one directory, so every reviewer (and
// every model) sees the same inputs:
//
//   diff.patch     merge-base diff (or the diff since the last reviewed commit)
//   files.json     changed files with added and deleted line counts
//   commits.txt    commit subjects in the range
//   spec.md        PR title and body plus linked issues (PR mode)
//   AGENTS.md, REVIEW.md, axioms.md   copied when present
//   context.json   summary, including the depth, the lenses and the model plan
//                  (see review-plan.mjs)
//
// Usage:
//   agent-review pin --pr <number> [--since <sha>] [--depth <d>] [--host <h>] [--out <dir>]
//   agent-review pin [--base <ref>] [--since <sha>] [--depth <d>] [--host <h>] [--out <dir>]   (local branch)
//
// Axioms come from $AXIOMS_PATH, else ~/.config/scalvert/axioms.md. They are
// optional; without them the taste lens does not run.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { checkRepoConfig, detectHost, HOSTS, lensesFor, loadUserConfig, resolveDepth, resolvePlan } from "./review-plan.mjs";

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const tryRun = (cmd, args, opts) => {
  try {
    return run(cmd, args, opts);
  } catch {
    return null;
  }
};

export const LENS_ORDER = ["correctness", "spec-fit", "security", "tests", "api-compat", "taste", "data", "docs"];
const MAX_LENSES = 6;
const MIN_LENSES = 3;

const SECURITY = /(auth|token|secret|passw|credential|crypto|permission|session|oauth|cookie|sql|exec|spawn|shell|eval|sanitiz|escape|cors|csrf|xss|redirect|upload|deserializ)/i;
const TEST_FILE = /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|^test_.*\.py$/i;
const DOC_FILE = /(^|\/)(docs?\/|README|CHANGELOG)|\.mdx?$/i;
const API_FILE = /(^|\/)(index\.[cm]?[jt]s|package\.json|.*\.d\.ts|openapi.*|.*\.proto|.*schema.*\.(json|ya?ml|graphql))$/i;
const DATA_FILE = /(migrat|\.sql$|schema\.prisma|models?\/)/i;

// Picks 3 to 6 lenses from what the diff touches. Correctness and spec fit
// always run; taste runs only when an axioms file is present. With
// { cap: false } it returns every lens the diff calls for, for a deep review.
export function chooseLenses({ files, changedText, hasAxioms, hasSpec, cap = true }) {
  const paths = files.map((f) => f.path);
  const source = paths.filter((p) => !TEST_FILE.test(p) && !DOC_FILE.test(p));
  const picked = new Set(["correctness"]);
  if (hasSpec) picked.add("spec-fit");
  if (paths.some((p) => SECURITY.test(p)) || SECURITY.test(changedText)) picked.add("security");
  if (source.length) picked.add("tests");
  if (paths.some((p) => API_FILE.test(p)) || /^-\s*export\b/m.test(changedText)) picked.add("api-compat");
  if (hasAxioms) picked.add("taste");
  if (paths.some((p) => DATA_FILE.test(p))) picked.add("data");
  if (paths.some((p) => DOC_FILE.test(p))) picked.add("docs");
  for (const fill of ["tests", "spec-fit", "docs"]) {
    if (picked.size >= MIN_LENSES) break;
    picked.add(fill);
  }
  const ordered = LENS_ORDER.filter((l) => picked.has(l));
  return cap ? ordered.slice(0, MAX_LENSES) : ordered;
}

// `git diff --numstat -z`: one "added<TAB>deleted<TAB>path" record per NUL,
// with the path as it is, never quoted or escaped. Without -z, git quotes a
// path such as src/auth/caf\303\251.js, and a glob would not match it.
export function parseNumstatZ(text) {
  return text
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const [added, deleted, ...rest] = record.split("\t");
      return { path: rest.join("\t"), added: Number(added) || 0, deleted: Number(deleted) || 0 };
    });
}

export function parseNumstat(text) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, ...rest] = line.split("\t");
      return { path: rest.join("\t"), added: Number(added) || 0, deleted: Number(deleted) || 0 };
    });
}

export function axiomsPath() {
  return process.env.AXIOMS_PATH ?? join(homedir(), ".config", "scalvert", "axioms.md");
}

export function generatedPaths(paths, head, cwd) {
  if (paths.length === 0) return new Set();
  // --source (git 2.40+) reads .gitattributes at the reviewed commit; older git
  // falls back to the checked-out tree.
  const out =
    tryRun("git", ["check-attr", "--source", head, "-z", "linguist-generated", "--", ...paths], cwd) ??
    tryRun("git", ["check-attr", "-z", "linguist-generated", "--", ...paths], cwd);
  const set = new Set();
  if (!out) return set;
  const parts = out.split("\0");
  for (let i = 0; i + 2 < parts.length; i += 3) {
    if (parts[i + 2] === "true" || parts[i + 2] === "set") set.add(parts[i]);
  }
  return set;
}

// The spec for a PR: its title, URL and description, then each issue it
// closes.
function prSpec(pr, cwd) {
  const issues = (pr.closingIssuesReferences ?? [])
    .map((i) => tryRun("gh", ["issue", "view", String(i.number), "--json", "number,title,body", "-q", '"#\\(.number) \\(.title)\\n\\n\\(.body)"'], cwd))
    .filter(Boolean);
  return [`# ${pr.title}`, "", pr.url, "", pr.body || "(no description)", ...issues.map((t) => `\n---\n\n${t}`)].join("\n");
}

function repoSlug() {
  const url = tryRun("git", ["config", "--get", "remote.origin.url"]) ?? "";
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function pin(o) {
  const root = run("git", ["rev-parse", "--show-toplevel"]);
  const cwd = { cwd: root };
  const out = o.out ?? mkdtempSync(join(tmpdir(), "review-"));
  mkdirSync(out, { recursive: true });

  let base;
  let head;
  let key;
  let spec = null;
  if (o.pr) {
    const pr = JSON.parse(
      run("gh", ["pr", "view", String(o.pr), "--json", "number,title,body,url,baseRefName,headRefOid,closingIssuesReferences"], cwd),
    );
    run("git", ["fetch", "-q", "origin", `pull/${pr.number}/head`, pr.baseRefName], cwd);
    head = pr.headRefOid;
    base = run("git", ["rev-parse", `origin/${pr.baseRefName}`], cwd);
    key = String(pr.number);
    spec = prSpec(pr, cwd);
  } else {
    const ref = o.base ?? (tryRun("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd) || "origin/main");
    base = run("git", ["rev-parse", ref], cwd);
    head = run("git", ["rev-parse", "HEAD"], cwd);
    key = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    // A branch with an open PR has a stated intent: use its description, so
    // the spec-fit lens has more than commit messages. No gh, no auth, or no
    // PR leaves spec empty.
    const text = tryRun("gh", ["pr", "view", "--json", "number,title,body,url,state,closingIssuesReferences"], cwd);
    let pr = null;
    try {
      pr = text ? JSON.parse(text) : null;
    } catch {
      pr = null;
    }
    if (pr?.state === "OPEN") spec = prSpec(pr, cwd);
  }

  const mergeBase = run("git", ["merge-base", base, head], cwd);
  if (o.since && tryRun("git", ["merge-base", "--is-ancestor", o.since, head], cwd) === null) {
    throw new Error(`--since ${o.since} is not an ancestor of ${head}; history was rewritten. Pin the full change without --since.`);
  }
  const from = o.since ?? mergeBase;
  // --no-renames keeps each path whole, so a renamed generated file is still
  // recognized as generated.
  const numstat = (range) => parseNumstatZ(run("git", ["diff", "--no-renames", "--numstat", "-z", range], cwd));
  const allFiles = numstat(`${from}..${head}`);
  // Files the repo marks as generated (linguist-generated in .gitattributes,
  // which GitHub also collapses in PR diffs) are left out of the review.
  const generated = generatedPaths(allFiles.map((f) => f.path), head, cwd);
  const files = allFiles.filter((f) => !generated.has(f.path));
  const exclude = [...generated].map((p) => `:(exclude,literal)${p}`);
  const diff = run("git", ["diff", "--no-renames", "--no-color", "-U5", `${from}..${head}`, "--", ".", ...exclude], cwd);
  const commits = run("git", ["log", "--no-color", "--format=%h %s", `${from}..${head}`], cwd);
  writeFileSync(join(out, "diff.patch"), `${diff}\n`);
  writeFileSync(join(out, "files.json"), `${JSON.stringify(files, null, 2)}\n`);
  writeFileSync(join(out, "commits.txt"), `${commits}\n`);
  if (spec) writeFileSync(join(out, "spec.md"), `${spec}\n`);

  // Review rules come from the base, not the change: a PR must not be able to
  // rewrite the rules it is reviewed against. A change to them is reviewed
  // like any other file and flagged in context.json.
  const copied = {};
  const rulesChanged = [];
  for (const name of ["AGENTS.md", "REVIEW.md"]) {
    const text = tryRun("git", ["show", `${mergeBase}:${name}`], cwd);
    if (text !== null) {
      writeFileSync(join(out, name), `${text}\n`);
      copied[name] = true;
    }
    if (allFiles.some((f) => f.path === name)) rulesChanged.push(name);
  }
  // The repo's review depth also comes from the base.
  const repoText = tryRun("git", ["show", `${mergeBase}:agent-review.json`], cwd);
  let repoConfig = null;
  if (repoText !== null) {
    const where = `agent-review.json at ${mergeBase.slice(0, 7)}`;
    let parsed;
    try {
      parsed = JSON.parse(repoText);
    } catch (e) {
      throw new Error(`${where}: ${e.message}`);
    }
    repoConfig = checkRepoConfig(parsed, where);
  }
  if (allFiles.some((f) => f.path === "agent-review.json")) rulesChanged.push("agent-review.json");
  const axioms = axiomsPath();
  if (existsSync(axioms)) {
    copyFileSync(axioms, join(out, "axioms.md"));
    copied["axioms.md"] = true;
  }

  const changedText = diff
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
    .join("\n");
  const hasSpec = Boolean(spec) || commits.length > 0;
  const chosen = chooseLenses({ files, changedText, hasAxioms: Boolean(copied["axioms.md"]), hasSpec, cap: false });

  // Depth looks at the whole change, not only the commits since the last
  // round, so a follow-up never drops below a deep path the PR touches.
  const prFiles = from === mergeBase ? allFiles : numstat(`${mergeBase}..${head}`);
  const user = loadUserConfig();
  if (o.host && !HOSTS.includes(o.host)) throw new Error(`--host must be one of ${HOSTS.join(", ")}`);
  // A detected host beats the config's, so Tau model IDs never reach Claude
  // Code. The config's host covers hosts that cannot be detected, such as Codex.
  const host = o.host ?? detectHost() ?? user.config.host ?? null;
  const depth = resolveDepth({ flag: o.depth, repo: repoConfig, user: user.config, files: prFiles });
  const lenses = lensesFor(depth.depth, chosen, { hasSpec });
  const plan = resolvePlan({ depth: depth.depth, lenses, host, config: user.config });

  const context = {
    repo: repoSlug(),
    key,
    base,
    head,
    mergeBase,
    since: o.since ?? null,
    files: files.length,
    generatedSkipped: generated.size,
    added: files.reduce((n, f) => n + f.added, 0),
    deleted: files.reduce((n, f) => n + f.deleted, 0),
    has: { spec: Boolean(spec), agents: Boolean(copied["AGENTS.md"]), review: Boolean(copied["REVIEW.md"]), axioms: Boolean(copied["axioms.md"]) },
    rulesChanged,
    depth: depth.depth,
    depthSource: depth.source,
    lenses,
    plan,
    userConfig: { path: user.path, found: existsSync(user.path) },
    dir: out,
  };
  writeFileSync(join(out, "context.json"), `${JSON.stringify(context, null, 2)}\n`);
  return context;
}
