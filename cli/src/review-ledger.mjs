// The review ledger: one JSON file per reviewed PR or branch that records each
// round, each finding, every classifier decision, and what a person later
// decided about each finding. Re-reviews read it to know what was already
// reviewed, and the pilot reads it to measure the review skills.
//
// Location: <state dir>/reviews/<owner>/<repo>/<key>.json, where <key> is the
//           PR number or the branch name. See stateDir() for the state dir.
//
// Usage:
//   agent-review ledger path   --repo <owner/repo> --key <pr|branch>
//   agent-review ledger start  --repo R --key K --base <sha> --head <sha> [--lenses a,b] [--models m1,m2]
//   agent-review ledger add    --repo R --key K --file findings.json   (or JSON on stdin)
//   agent-review ledger decide --repo R --key K --id F1 --kind <kind> --json '<decision>'
//   agent-review ledger ran    --repo R --key K --lens <lens> --model <provider/model> [--findings N]
//   agent-review ledger merge  --repo R --key K --into F1 --ids F4,F7   (same root cause)
//   agent-review ledger report --repo R --key K [--threshold 0.7] [--allow-missing]
//   agent-review ledger dispose --repo R --key K --id F1 --as accepted|fixed|dismissed|wont-fix [--note text]
//   agent-review ledger open   --repo R --key K   (reported in any round, not yet closed)
//   agent-review ledger last-head --repo R --key K
//   agent-review ledger summary [--repo R --key K]   (no key: every ledger)

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { check as checkDecision } from "./classify.mjs";

export const SCHEMA = "scalvert.review/v1";
export const DEFAULT_THRESHOLD = 0.7;
const DISPOSITIONS = ["accepted", "fixed", "dismissed", "wont-fix"];
const SEVERITY_ORDER = { blocker: 0, "should-fix": 1, nit: 2 };
const REQUIRED_FINDING = ["lens", "file", "title", "precondition", "scenario"];

export class LedgerError extends Error {}

// The state dir, first match wins:
//   1. $AGENT_REVIEWS_STATE_DIR
//   2. $SCALVERT_STATE_DIR (the old name, still honored)
//   3. ~/.local/state/scalvert, if it holds reviews and the new default holds
//      none yet, so ledgers from before the rename stay in use. It keys on
//      reviews/ rather than the directory, so an empty agent-reviews directory
//      made by another tool does not hide the old ledgers.
//   4. $XDG_STATE_HOME/agent-reviews, else ~/.local/state/agent-reviews
export function stateDir() {
  const explicit = process.env.AGENT_REVIEWS_STATE_DIR || process.env.SCALVERT_STATE_DIR;
  if (explicit) return explicit;
  const base = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  const current = join(base, "agent-reviews");
  const legacy = join(homedir(), ".local", "state", "scalvert");
  if (!existsSync(join(current, "reviews")) && existsSync(join(legacy, "reviews"))) return legacy;
  return current;
}

export function ledgerPath(repo, key) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) throw new LedgerError(`--repo must be owner/repo, got "${repo}"`);
  if (!key) throw new LedgerError("--key is required (a PR number or branch name)");
  return join(stateDir(), "reviews", repo, `${keyFile(key)}.json`);
}

// Percent-encodes everything except letters, digits, ".", "-" and "_", so
// distinct keys such as "a/b" and "a_b" never share a file.
export function keyFile(key) {
  return [...String(key)]
    .map((ch) => (/[\w.-]/.test(ch) ? ch : [...Buffer.from(ch)].map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join("")))
    .join("");
}

// Reported findings from earlier rounds that nobody has closed yet.
export function openFindings(ledger) {
  return ledger.findings.filter((f) => f.reported && !f.duplicateOf && (!f.disposition || f.disposition.as === "accepted"));
}

export function load(repo, key) {
  const path = ledgerPath(repo, key);
  if (!existsSync(path)) return { schema: SCHEMA, repo, key: String(key), rounds: [], findings: [] };
  const ledger = JSON.parse(readFileSync(path, "utf8"));
  if (ledger.schema !== SCHEMA) throw new LedgerError(`${path}: unknown schema ${ledger.schema}`);
  return ledger;
}

export function save(ledger) {
  const path = ledgerPath(ledger.repo, ledger.key);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(tmp, path);
  return path;
}

export function startRound(ledger, { base, head, lenses = [], models = [] }) {
  if (!base || !head) throw new LedgerError("start needs --base and --head");
  const round = ledger.rounds.length + 1;
  ledger.rounds.push({ round, base, head, lenses, models, startedAt: new Date().toISOString() });
  return round;
}

export function addFindings(ledger, findings) {
  if (!Array.isArray(findings)) throw new LedgerError("findings must be a JSON array");
  const round = ledger.rounds.at(-1)?.round;
  if (!round) throw new LedgerError("start a round before adding findings");
  const added = [];
  for (const f of findings) {
    const missing = REQUIRED_FINDING.filter((k) => !f[k]);
    if (missing.length) throw new LedgerError(`finding "${f.title ?? "?"}" is missing ${missing.join(", ")}`);
    if (f.model != null) checkModel(f.model, `finding "${f.title}" model`);
    const id = `F${ledger.findings.length + 1}`;
    ledger.findings.push({
      id,
      round,
      lens: f.lens,
      model: f.model ?? null,
      file: f.file,
      line: f.line ?? null,
      title: f.title,
      precondition: f.precondition,
      scenario: f.scenario,
      evidence: f.evidence ?? null,
      axiom: f.axiom ?? null,
      decisions: {},
      reported: false,
      disposition: null,
    });
    added.push(id);
  }
  return added;
}

export function decide(ledger, id, kind, decision) {
  const finding = ledger.findings.find((f) => f.id === id);
  if (!finding) throw new LedgerError(`no finding ${id}`);
  if (decision?.model != null) checkModel(decision.model, "decision model");
  const checked = checkDecision(kind, decision);
  finding.decisions[kind] = { ...checked, at: new Date().toISOString() };
  return finding.decisions[kind];
}

// Marks findings as duplicates of one primary finding (same root cause), so
// the primary is verified and reported once and carries who else found it.
export function mergeFindings(ledger, primaryId, duplicateIds) {
  const primary = ledger.findings.find((f) => f.id === primaryId);
  if (!primary) throw new LedgerError(`no finding ${primaryId}`);
  if (primary.duplicateOf) throw new LedgerError(`${primaryId} is itself a duplicate of ${primary.duplicateOf}`);
  for (const id of duplicateIds) {
    const dup = ledger.findings.find((f) => f.id === id);
    if (!dup) throw new LedgerError(`no finding ${id}`);
    if (id === primaryId) continue;
    dup.duplicateOf = primaryId;
    for (const f of ledger.findings) if (f.duplicateOf === id) f.duplicateOf = primaryId;
  }
  return foundBy(ledger, primary);
}

export function foundBy(ledger, primary) {
  const group = [primary, ...ledger.findings.filter((f) => f.duplicateOf === primary.id)];
  return {
    reviewers: group.length,
    lenses: [...new Set(group.map((f) => f.lens))].sort(),
    families: [...new Set(group.map((f) => family(f.model)).filter(Boolean))].sort(),
  };
}

export function dispose(ledger, id, as, note) {
  if (!DISPOSITIONS.includes(as)) throw new LedgerError(`--as must be one of ${DISPOSITIONS.join(", ")}`);
  const finding = ledger.findings.find((f) => f.id === id);
  if (!finding) throw new LedgerError(`no finding ${id}`);
  finding.disposition = { as, note: note ?? null, at: new Date().toISOString() };
  return finding;
}

// Records that one reviewer ran, including runs that found nothing, so the
// report can prove every chosen lens ran and which model families took part.
const LENS_NAME = /^[a-z][a-z-]*$/;
const MODEL_ID = /^[\w.-]+\/[\w.:@-]+$/;

export function checkModel(model, what = "model") {
  if (typeof model !== "string" || !MODEL_ID.test(model)) {
    throw new LedgerError(`${what} must look like provider/model-id, got "${model}"`);
  }
  return model;
}

export function recordRun(ledger, { lens, model, findings = 0 }) {
  const current = ledger.rounds.at(-1);
  if (!current) throw new LedgerError("start a round before recording a run");
  if (typeof lens !== "string" || !LENS_NAME.test(lens)) {
    throw new LedgerError(`--lens must be one lens name such as correctness, got "${lens}"`);
  }
  if (current.lenses.length && !current.lenses.includes(lens)) {
    throw new LedgerError(`lens "${lens}" is not in this round (${current.lenses.join(", ")})`);
  }
  checkModel(model, "--model");
  current.runs ??= [];
  current.runs.push({ lens, model, findings: Number(findings) || 0, at: new Date().toISOString() });
  return current.runs.length;
}

const family = (model) => (model ? String(model).split("/")[0].toLowerCase() : null);

// Model families that reviewed or verified in a round.
export function roundFamilies(ledger, round) {
  const r = ledger.rounds.find((x) => x.round === round);
  const models = [
    ...(r?.runs ?? []).map((run) => run.model),
    ...ledger.findings
      .filter((f) => f.round === round)
      .flatMap((f) => [f.model, ...Object.values(f.decisions).map((d) => d.model)]),
  ];
  return [...new Set(models.map(family).filter(Boolean))].sort();
}

// Findings that pass the verification gate, in report order. Marks them
// reported. Refuses when a chosen lens has no recorded run, because a report
// must not claim a panel that did not happen.
export function report(ledger, threshold = DEFAULT_THRESHOLD, { allowMissing = false } = {}) {
  const current = ledger.rounds.at(-1);
  const round = current?.round;
  const ran = new Set((current?.runs ?? []).map((r) => r.lens));
  const missingLenses = (current?.lenses ?? []).filter((l) => !ran.has(l));
  if (missingLenses.length && !allowMissing) {
    throw new LedgerError(
      `no recorded run for lens(es) ${missingLenses.join(", ")}. Run them and record each with "ran", or pass --allow-missing and name the skipped lenses in the report.`,
    );
  }
  const primaries = ledger.findings.filter((f) => f.round === round && !f.duplicateOf);
  const unverified = primaries.filter((f) => !f.decisions["finding-verification"]).map((f) => f.id);
  if (unverified.length && !allowMissing) {
    throw new LedgerError(`finding(s) ${unverified.join(", ")} have no verification decision. Verify them first.`);
  }
  const passing = primaries.filter((f) => {
    const v = f.decisions["finding-verification"];
    return v && v.label === "confirmed" && v.probability >= threshold;
  });
  passing.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.decisions["finding-severity"]?.label] ?? 3) -
        (SEVERITY_ORDER[b.decisions["finding-severity"]?.label] ?? 3) ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
  for (const f of passing) f.reported = true;
  const dropped = primaries.filter((f) => !passing.includes(f)).map((f) => f.id);
  const merged = ledger.findings.filter((f) => f.round === round && f.duplicateOf).map((f) => f.id);
  return {
    round,
    threshold,
    findings: passing.map((f) => ({ ...f, foundBy: foundBy(ledger, f) })),
    dropped,
    merged,
    missingLenses,
    families: roundFamilies(ledger, round),
  };
}

// Pilot metrics. Calibration is the Brier score of the verification
// probability against what a person decided (accepted or fixed = real).
export function summarize(ledgers) {
  const all = ledgers.flatMap((l) => l.findings.map((f) => ({ ...f, ledger: `${l.repo}#${l.key}` })));
  const reported = all.filter((f) => f.reported);
  const disposed = reported.filter((f) => f.disposition);
  const dismissed = disposed.filter((f) => ["dismissed", "wont-fix"].includes(f.disposition.as));
  const scored = all.filter((f) => f.disposition && f.decisions["finding-verification"]);
  const brier = scored.length
    ? scored.reduce((sum, f) => {
        const real = ["accepted", "fixed"].includes(f.disposition.as) ? 1 : 0;
        return sum + (f.decisions["finding-verification"].probability - real) ** 2;
      }, 0) / scored.length
    : null;
  const families = new Set(
    ledgers.flatMap((l) => l.rounds.flatMap((r) => roundFamilies(l, r.round))),
  );
  return {
    ledgers: ledgers.length,
    rounds: ledgers.reduce((n, l) => n + l.rounds.length, 0),
    findings: all.length,
    reported: reported.length,
    reportedPerLedger: ledgers.length ? reported.length / ledgers.length : 0,
    disposed: disposed.length,
    dismissalRate: disposed.length ? dismissed.length / disposed.length : null,
    verificationBrier: brier,
    modelFamilies: [...families].sort(),
  };
}

export function allLedgers() {
  const root = join(stateDir(), "reviews");
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith(".json")) out.push(JSON.parse(readFileSync(p, "utf8")));
    }
  };
  walk(root);
  return out.filter((l) => l.schema === SCHEMA);
}

