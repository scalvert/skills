#!/usr/bin/env node
// Pins everything a review needs into one directory, so every reviewer (and
// every model) sees the same inputs:
//
//   diff.patch     merge-base diff (or the diff since the last reviewed commit)
//   files.json     changed files with added and deleted line counts
//   commits.txt    commit subjects in the range
//   spec.md        PR title and body plus linked issues (PR mode)
//   AGENTS.md, REVIEW.md, axioms.md   copied when present
//   context.json   summary, including the lenses chosen for this diff
//
// Usage:
//   review-context.mjs --pr <number> [--since <sha>] [--out <dir>]
//   review-context.mjs [--base <ref>] [--since <sha>] [--out <dir>]   (local branch)
//
// Axioms come from $AXIOMS_PATH, else ~/.config/scalvert/axioms.md. They are
// optional; without them the taste lens does not run.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
// always run; taste runs only when an axioms file is present.
export function chooseLenses({ files, changedText, hasAxioms, hasSpec }) {
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
  return LENS_ORDER.filter((l) => picked.has(l)).slice(0, MAX_LENSES);
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

function repoSlug() {
  const url = tryRun("git", ["config", "--get", "remote.origin.url"]) ?? "";
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) o[argv[i].slice(2)] = argv[++i];
  return o;
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
    const issues = (pr.closingIssuesReferences ?? [])
      .map((i) => tryRun("gh", ["issue", "view", String(i.number), "--json", "number,title,body", "-q", '"#\\(.number) \\(.title)\\n\\n\\(.body)"'], cwd))
      .filter(Boolean);
    spec = [`# ${pr.title}`, "", pr.url, "", pr.body || "(no description)", ...issues.map((t) => `\n---\n\n${t}`)].join("\n");
  } else {
    const ref = o.base ?? (tryRun("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd) || "origin/main");
    base = run("git", ["rev-parse", ref], cwd);
    head = run("git", ["rev-parse", "HEAD"], cwd);
    key = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  }

  const mergeBase = run("git", ["merge-base", base, head], cwd);
  const from = o.since ?? mergeBase;
  const diff = run("git", ["diff", "--no-color", "-U5", `${from}..${head}`], cwd);
  const files = parseNumstat(run("git", ["diff", "--numstat", `${from}..${head}`], cwd));
  const commits = run("git", ["log", "--no-color", "--format=%h %s", `${from}..${head}`], cwd);
  writeFileSync(join(out, "diff.patch"), `${diff}\n`);
  writeFileSync(join(out, "files.json"), `${JSON.stringify(files, null, 2)}\n`);
  writeFileSync(join(out, "commits.txt"), `${commits}\n`);
  if (spec) writeFileSync(join(out, "spec.md"), `${spec}\n`);

  const copied = {};
  for (const name of ["AGENTS.md", "REVIEW.md"]) {
    const text = tryRun("git", ["show", `${head}:${name}`], cwd);
    if (text !== null) {
      writeFileSync(join(out, name), `${text}\n`);
      copied[name] = true;
    }
  }
  const axioms = axiomsPath();
  if (existsSync(axioms)) {
    copyFileSync(axioms, join(out, "axioms.md"));
    copied["axioms.md"] = true;
  }

  const changedText = diff
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
    .join("\n");
  const lenses = chooseLenses({
    files,
    changedText,
    hasAxioms: Boolean(copied["axioms.md"]),
    hasSpec: Boolean(spec) || commits.length > 0,
  });

  const context = {
    repo: repoSlug(),
    key,
    base,
    head,
    mergeBase,
    since: o.since ?? null,
    files: files.length,
    added: files.reduce((n, f) => n + f.added, 0),
    deleted: files.reduce((n, f) => n + f.deleted, 0),
    has: { spec: Boolean(spec), agents: Boolean(copied["AGENTS.md"]), review: Boolean(copied["REVIEW.md"]), axioms: Boolean(copied["axioms.md"]) },
    lenses,
    dir: out,
  };
  writeFileSync(join(out, "context.json"), `${JSON.stringify(context, null, 2)}\n`);
  return context;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(pin(args(process.argv.slice(2))), null, 2));
  } catch (err) {
    console.error(`review-context: ${err.stderr?.toString().trim() || err.message}`);
    process.exit(2);
  }
}
