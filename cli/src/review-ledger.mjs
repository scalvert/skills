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
//   agent-review ledger start  --repo R --key K --base <sha> --head <sha> [--lenses a,b] [--models m1,m2] [--past-cap]
//   agent-review ledger add    --repo R --key K --file findings.json   (or JSON on stdin)
//   agent-review ledger decide --repo R --key K --id F1 --kind <kind> --json '<decision>'
//   agent-review ledger ran    --repo R --key K --lens <lens> --model <provider/model> [--findings N]
//   agent-review ledger merge  --repo R --key K --into F1 --ids F4,F7   (same root cause)
//   agent-review ledger report --repo R --key K [--threshold 0.7] [--allow-missing] [--keep F9,F10]
//   agent-review ledger dispose --repo R --key K --id F1 --as fixed|accepted|wrong|intended|not-worth-it [--note text | --note-file file|-]
//   agent-review ledger link   --repo R --key K --id F1 --thread <threadId> [--url <url>]
//   agent-review ledger open   --repo R --key K   (reported in any round, not yet closed, with each one's linked thread)
//   agent-review ledger last-head --repo R --key K
//   agent-review ledger summary [--repo R [--key K]]   (no repo: every ledger)

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { cliStateRoot } from "agent-review/cli";
import { check as checkDecision } from "./classify.mjs";

export const SCHEMA = "scalvert.review/v1";
export const DEFAULT_THRESHOLD = 0.7;
// What a person decided about a reported finding, after the way the Claude
// Code team sorts reviewer comments: fixed it, or will (accepted); said it
// was wrong; said the behavior was intended; or decided it did not matter.
// The last three are noise. "not-worth-it" findings were real, so they count
// as real when scoring the verifier.
const DISPOSITIONS = ["fixed", "accepted", "wrong", "intended", "not-worth-it"];
const REAL = new Set(["fixed", "accepted", "not-worth-it"]);
const NOISE = new Set(["wrong", "intended", "not-worth-it", "dismissed", "wont-fix"]);
// Older ledgers hold these; new decisions must use the finer labels.
const RETIRED = { dismissed: "wrong", "wont-fix": "intended or not-worth-it" };
const REQUIRED_FINDING = ["lens", "file", "title", "precondition", "scenario"];
const CLASS_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Review rounds per PR or branch before the ledger asks the author to step
// back. Each round past a few mostly finds older problems, not new ones.
export const MAX_ROUNDS = 3;
// Lines apart at which a new finding in the same file counts as a possible
// repeat of an earlier one. Lines move a little between rounds.
const REPEAT_WINDOW = 3;

export class LedgerError extends Error {}

// The state dir, first match wins:
//   1. $AGENT_REVIEWS_STATE_DIR
//   2. $SCALVERT_STATE_DIR (the old name, still honored)
//   3. ~/.local/state/scalvert, if it holds reviews and the new default holds
//      none yet, so ledgers from before the rename stay in use. It keys on
//      reviews/ rather than the directory, so an empty agent-reviews directory
//      made by another tool does not hide the old ledgers.
//   4. $XDG_STATE_HOME/agent-reviews, else ~/.local/state/agent-reviews
// The review harness keeps its reviews in the same root, so the lookup is
// the harness's own: one answer for v1 ledgers and harness reviews alike.
export function stateDir() {
  return cliStateRoot();
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
  // A unique name per writer, so two writers never rename each other's file.
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(tmp, path);
  return path;
}

// Load, change and save one ledger under its lock. Agents write to the same
// ledger in parallel; without the lock, the last writer silently drops the
// others' changes. Each writer either commits or fails with "ledger busy"
// and writes nothing. If fn throws, nothing is saved.
//
// The lock is a file created with O_EXCL next to the ledger. A lock whose
// process is gone was left by a crash and is removed, but only by whoever
// holds a short breaker lock (<lock>.break), and only after reading it again
// under the breaker, so two waiters never reclaim at once and delete each
// other's live lock. A lock held by a live process is never removed, however
// old; the writer reports busy. A lock with no readable PID is stale once it
// is older than STALE_LOCK_MS. This covers writers on one machine, not a
// shared network state directory.
export function update(repo, key, fn) {
  const path = ledgerPath(repo, key);
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  const token = acquire(lock);
  try {
    const l = load(repo, key);
    const result = fn(l);
    save(l);
    return result;
  } finally {
    release(lock, token);
  }
}

const STALE_LOCK_MS = 30_000;
const lockTimeoutMs = () => Number(process.env.AGENT_REVIEWS_LOCK_TIMEOUT_MS) || 10_000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function readLock(lock) {
  try {
    return { text: readFileSync(lock, "utf8"), mtimeMs: statSync(lock).mtimeMs };
  } catch {
    return null;
  }
}

// Stale only when its writer is gone. A lock with no readable PID, left by a
// crash while it was being created, is stale only by age.
function isStale({ text, mtimeMs }) {
  let pid;
  try {
    pid = JSON.parse(text).pid;
  } catch {
    return Date.now() - mtimeMs > STALE_LOCK_MS;
  }
  return !alive(pid);
}

const newToken = () => JSON.stringify({ pid: process.pid, id: randomBytes(6).toString("hex"), at: new Date().toISOString() });

function create(path, token) {
  try {
    const fd = openSync(path, "wx");
    try {
      writeSync(fd, token);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    return false;
  }
}

// Remove a stale lock while holding the breaker. A breaker left by a crash is
// cleared when its process is gone.
function reclaim(lock) {
  const breaker = `${lock}.break`;
  const token = newToken();
  if (!create(breaker, token)) {
    const b = readLock(breaker);
    if (b && isStale(b)) {
      try {
        unlinkSync(breaker);
      } catch {}
    }
    return;
  }
  try {
    const held = readLock(lock);
    if (held && isStale(held)) {
      try {
        unlinkSync(lock);
      } catch {}
    }
  } finally {
    release(breaker, token);
  }
}

function acquire(lock) {
  const token = newToken();
  const deadline = Date.now() + lockTimeoutMs();
  for (let wait = 5; ; wait = Math.min(wait * 2, 100)) {
    if (create(lock, token)) return token;
    const held = readLock(lock);
    if (held && isStale(held)) {
      reclaim(lock);
      // Retry at once only if the lock is gone; otherwise wait, so the
      // deadline still applies.
      if (!readLock(lock)) continue;
    }
    if (Date.now() > deadline) {
      throw new LedgerError(`ledger busy: another writer holds ${lock}, so nothing was written. Retry; if no review is running, remove the lock file.`);
    }
    sleep(wait + Math.floor(Math.random() * wait));
  }
}

function release(lock, token) {
  if (readLock(lock)?.text !== token) return;
  try {
    unlinkSync(lock);
  } catch {}
}

export function startRound(ledger, { base, head, lenses = [], models = [], pastCap = false, depth = null }) {
  if (!base || !head) throw new LedgerError("start needs --base and --head");
  if (depth != null && !["quick", "standard", "deep"].includes(depth)) throw new LedgerError(`--depth must be quick, standard or deep, got "${depth}"`);
  if (ledger.rounds.length >= MAX_ROUNDS && !pastCap) {
    throw new LedgerError(
      `this has had ${ledger.rounds.length} review rounds. Another round mostly finds older problems. ` +
        `Ask the author to step back and reconsider the approach. Start one more round only when a person asks for it, with --past-cap.`,
    );
  }
  const round = ledger.rounds.length + 1;
  ledger.rounds.push({ round, base, head, depth, lenses, models, startedAt: new Date().toISOString() });
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
    if (f.class != null && !CLASS_NAME.test(f.class)) {
      throw new LedgerError(`finding "${f.title}" class must be kebab-case, such as unescaped-shell-arg, got "${f.class}"`);
    }
    const instances = f.instances ?? [];
    if (!Array.isArray(instances) || instances.some((x) => !x || typeof x.file !== "string")) {
      throw new LedgerError(`finding "${f.title}" instances must be a list of {file, line}`);
    }
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
      class: f.class ?? null,
      instances: instances.map((x) => ({ file: x.file, line: x.line ?? null })),
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
  if (kind === "finding-origin" && checked.label === "missed" && finding.round === 1) {
    throw new LedgerError(`${id} is from round 1; "missed" needs an earlier round. Use introduced or pre-existing.`);
  }
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
    // The family recorded with the finding when there is one: the harness
    // stores the family the panel was checked against.
    families: [...new Set(group.map((f) => f.family ?? family(f.model)).filter(Boolean))].sort(),
  };
}

// Records the GitHub review thread that carries a finding, so a follow-up
// round replies in that thread instead of naming the finding by its ledger ID.
// Ledger IDs are internal keys and never appear in posted text.
export function link(ledger, id, { thread, url }) {
  const finding = ledger.findings.find((f) => f.id === id);
  if (!finding) throw new LedgerError(`no finding ${id}`);
  if (finding.duplicateOf) throw new LedgerError(`${id} is a duplicate of ${finding.duplicateOf}; link the primary`);
  if (!thread) throw new LedgerError("--thread is required");
  finding.thread = { id: thread, url: url ?? null, at: new Date().toISOString() };
  return finding.thread;
}

// Dispositions that close a finding without fixing it. Clearing one that
// would block a merge (a blocker, a should-fix, or one never rated) or one
// triaged needs-judgment overrides an independent verification, so only a
// person can do it. The harness applies the same rule to its findings.
const CLEARING = new Set(["wrong", "intended", "not-worth-it"]);
const DISQUALIFYING = new Set(["blocker", "should-fix"]);
const ACTOR = /^(human|agent):[^\s]/;

export function checkDisposeActor(finding, as, actor) {
  if (actor != null && !ACTOR.test(actor)) throw new LedgerError(`--actor must be human:<name> or agent:<runtime>, got "${actor}"`);
  const sev = finding.decisions?.["finding-severity"]?.label ?? null;
  const judgment = finding.decisions?.["finding-triage"]?.label === "needs-judgment";
  const person = judgment || (CLEARING.has(as) && (sev === null || DISQUALIFYING.has(sev)));
  if (person && !actor?.startsWith("human:")) {
    const what = judgment ? "it needs judgment" : `it is ${sev ?? "unrated"}`;
    throw new LedgerError(`only a person can mark ${finding.id} ${as}: ${what}. Ask them, then pass --actor human:<name>`);
  }
}

export function dispose(ledger, id, as, note, { actor = null } = {}) {
  if (RETIRED[as]) throw new LedgerError(`--as ${as} was split; use ${RETIRED[as]}`);
  if (!DISPOSITIONS.includes(as)) throw new LedgerError(`--as must be one of ${DISPOSITIONS.join(", ")}`);
  const finding = ledger.findings.find((f) => f.id === id);
  if (!finding) throw new LedgerError(`no finding ${id}`);
  finding.disposition = { as, note: note ?? null, at: new Date().toISOString(), ...(actor ? { actor } : {}) };
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

// Gateways that serve models from many providers under one prefix, as Glean
// Tau does with glean/CLAUDE_5_5_OPUS and glean/GPT6_1_SOL. For these, the
// family comes from the model name, so Claude and GPT behind one gateway
// still count as two families.
const GATEWAYS = new Set(["glean", "openrouter", "bedrock", "vertex"]);
const NAMED_FAMILIES = [
  [/^(anthropic[.:/-])?claude/i, "anthropic"],
  [/^(openai[.:/-])?(gpt|o\d|chatgpt|codex)/i, "openai"],
  [/^(google[.:/-])?gemini/i, "google"],
  [/^(x-?ai[.:/-])?grok/i, "xai"],
  [/^(meta[.:/-])?llama/i, "meta"],
  [/^(mistral|mixtral|codestral)/i, "mistral"],
  [/^deepseek/i, "deepseek"],
  [/^(glm|zhipu)/i, "zhipu"],
  [/^(kimi|moonshot)/i, "moonshot"],
  [/^qwen/i, "alibaba"],
  [/^nemotron/i, "nvidia"],
];

// A model behind a gateway that matches no known family counts as the
// gateway's own family, so two unknown models never pass as two families.
// Bedrock's region prefix (us., eu., apac., global.) is not part of the name.
export function family(model) {
  if (!model) return null;
  const [provider, ...rest] = String(model).split("/");
  const p = provider.toLowerCase();
  if (!GATEWAYS.has(p)) return p;
  const name = rest.join("/").replace(/^(us|eu|apac|ap|global)\./i, "");
  const hit = NAMED_FAMILIES.find(([re]) => re.test(name));
  return hit ? hit[1] : p;
}

// Model families that reviewed or verified in a round.
export function roundFamilies(ledger, round) {
  const r = ledger.rounds.find((x) => x.round === round);
  // A recorded family wins over one inferred from the model name.
  const fam = (x) => x.family ?? family(x.model);
  const families = [
    ...(r?.runs ?? []).map(fam),
    ...ledger.findings.filter((f) => f.round === round).flatMap((f) => [fam(f), ...Object.values(f.decisions).map(fam)]),
  ];
  return [...new Set(families.filter(Boolean))].sort();
}

// Where a confirmed finding goes in the report. Only an introduced finding
// can be a blocker: a problem that was already there (missed in an earlier
// round, or older than the PR) is never what holds a PR back. Raising old
// problems as blockers round after round is what keeps a PR from converging.
export function placement(f) {
  const severity = f.decisions["finding-severity"]?.label ?? null;
  const origin = f.decisions["finding-origin"]?.label ?? "introduced";
  const capped = severity === "blocker" && origin !== "introduced";
  const effective = capped ? "should-fix" : severity;
  let section = "smaller";
  if (effective === "blocker") section = "blockers";
  else if (effective === "should-fix") section = origin === "pre-existing" ? "pre-existing" : "should-fix";
  else if (effective === null) section = "unrated";
  return { severity: effective, origin, cappedFrom: capped ? "blocker" : null, section };
}
export const SECTION_ORDER = { blockers: 0, "should-fix": 1, "pre-existing": 2, smaller: 3, unrated: 4 };

const locKey = (x) => `${x.file}:${x.line ?? ""}`;

// Every other place a finding covers: its own instances, and the location
// and instances of each duplicate merged into it, without the primary's own
// location and without repeats.
export function allInstances(ledger, primary) {
  const seen = new Set([locKey(primary)]);
  const out = [];
  const group = [primary, ...ledger.findings.filter((f) => f.duplicateOf === primary.id)];
  for (const f of group) {
    for (const loc of [{ file: f.file, line: f.line ?? null }, ...(f.instances ?? [])]) {
      if (seen.has(locKey(loc))) continue;
      seen.add(locKey(loc));
      out.push({ file: loc.file, line: loc.line ?? null });
    }
  }
  return out;
}

const locations = (ledger, f) => [{ file: f.file, line: f.line ?? null }, ...allInstances(ledger, f)];

// Earlier-round findings that a new finding may repeat: some place of one
// (its location or an instance) is in the same file as some place of the
// other, and the lines are close or the bug class is the same.
//
// An earlier finding marked fixed is left out: if the same problem turns up
// again, the fix did not hold, and the new finding must be reported. See
// recurrences().
export function possibleRepeats(ledger, finding) {
  return matchingEarlier(ledger, finding).filter((e) => e.disposition?.as !== "fixed");
}

// Earlier findings marked fixed that a new finding matches: the problem came
// back after a fix.
export function recurrences(ledger, finding) {
  return matchingEarlier(ledger, finding).filter((e) => e.disposition?.as === "fixed");
}

function matchingEarlier(ledger, finding) {
  const mine = locations(ledger, finding);
  return ledger.findings.filter((e) => {
    if (!(e.round < finding.round && e.reported && !e.duplicateOf)) return false;
    const sameClass = e.class != null && e.class === finding.class;
    return locations(ledger, e).some((a) =>
      mine.some(
        (b) =>
          a.file === b.file &&
          (sameClass || (a.line != null && b.line != null && Math.abs(a.line - b.line) <= REPEAT_WINDOW)),
      ),
    );
  });
}

// Findings that pass the verification gate, in report order. Marks them
// reported. Refuses when a chosen lens has no recorded run, because a report
// must not claim a panel that did not happen; when a blocker has no origin;
// and when a finding may repeat one from an earlier round, because a review
// must not raise the same thing twice.
export function report(ledger, threshold = DEFAULT_THRESHOLD, { allowMissing = false, keep = [] } = {}) {
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
  const noOrigin = passing
    .filter((f) => f.decisions["finding-severity"]?.label === "blocker" && !f.decisions["finding-origin"])
    .map((f) => f.id);
  if (noOrigin.length) {
    throw new LedgerError(`blocker(s) ${noOrigin.join(", ")} have no finding-origin decision. Only an introduced finding can be a blocker; record its origin first.`);
  }
  const kept = new Set(keep);
  const repeats = passing
    .filter((f) => !kept.has(f.id))
    .map((f) => ({ f, earlier: possibleRepeats(ledger, f) }))
    .filter((r) => r.earlier.length);
  if (repeats.length) {
    const lines = repeats.map(
      ({ f, earlier }) =>
        `${f.id} (${f.file}:${f.line ?? "?"}) may repeat ${earlier.map((e) => `${e.id} from round ${e.round} (${e.file}:${e.line ?? "?"}, ${e.disposition?.as ?? "open"})`).join(", ")}`,
    );
    throw new LedgerError(
      `${lines.join("; ")}. Merge each into the earlier finding with "ledger merge --into <earlier> --ids <new>", or pass --keep <new> when it is a different bug.`,
    );
  }
  const placed = new Map(passing.map((f) => [f, placement(f)]));
  passing.sort(
    (a, b) =>
      SECTION_ORDER[placed.get(a).section] - SECTION_ORDER[placed.get(b).section] ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
  for (const f of passing) f.reported = true;
  const dropped = primaries.filter((f) => !passing.includes(f)).map((f) => f.id);
  const merged = ledger.findings.filter((f) => f.round === round && f.duplicateOf).map((f) => f.id);
  const findings = passing.map((f, i) => ({
    ...f,
    // n is the number a person sees in this report (1, 2, 3). The id is the
    // ledger key for later commands; it is never shown.
    n: i + 1,
    ...placed.get(f),
    instances: allInstances(ledger, f),
    // Earlier findings marked fixed that this one matches: the fix did not hold.
    recurs: recurrences(ledger, f).map((e) => ({ id: e.id, round: e.round, file: e.file, line: e.line ?? null })),
    foundBy: foundBy(ledger, f),
  }));
  const tally = (list) => {
    const out = Object.fromEntries(Object.keys(SECTION_ORDER).map((s) => [s, 0]));
    for (const f of list) out[f.section] += 1;
    return out;
  };
  const counts = tally(findings);
  // Findings from earlier rounds that are still open (not fixed, or accepted
  // but not yet fixed). They hold the PR back as much as new ones do.
  const earlierOpen = tally(openFindings(ledger).filter((f) => f.round < round).map(placement));
  const holding = (c) => c.blockers + c["should-fix"] + c.unrated;
  return {
    round,
    threshold,
    // ready: nothing new or still open is a blocker, should-fix or unrated.
    // Pre-existing and smaller items never hold a PR back.
    verdict: holding(counts) + holding(earlierOpen) === 0 ? "ready" : "needs-changes",
    counts,
    earlierOpen,
    findings,
    dropped,
    merged,
    missingLenses,
    families: roundFamilies(ledger, round),
  };
}

const rate = (part, whole) => (whole ? part / whole : null);

// A bug class that keeps coming back in one repo is worth a rule: when people
// fix it, a rule that prevents it (AGENTS.md or a lint rule); when they wave
// it off, a REVIEW.md line that stops reviewers raising it.
export const REPEAT_MIN_FINDINGS = 3;
export const REPEAT_MIN_LEDGERS = 2;

function repeatedClasses(reported) {
  const groups = new Map();
  for (const f of reported) {
    if (!f.class) continue;
    const k = `${f.repo}\0${f.class}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  return [...groups.values()]
    .map((g) => {
      const disposed = g.filter((f) => f.disposition);
      const fixed = disposed.filter((f) => ["fixed", "accepted"].includes(f.disposition.as)).length;
      const noise = disposed.filter((f) => NOISE.has(f.disposition.as)).length;
      return {
        repo: g[0].repo,
        class: g[0].class,
        findings: g.length,
        ledgers: new Set(g.map((f) => f.ledger)).size,
        fixed,
        noise,
        // No suggestion until people's decisions lean one way.
        suggest:
          fixed > noise
            ? "prevent it: an AGENTS.md convention or a lint rule"
            : noise > fixed
              ? "stop raising it: a REVIEW.md line"
              : null,
        titles: [...new Set(g.map((f) => f.title))].slice(0, 3),
      };
    })
    .filter((c) => c.findings >= REPEAT_MIN_FINDINGS && c.ledgers >= REPEAT_MIN_LEDGERS)
    .sort((a, b) => b.findings - a.findings);
}

// Pilot metrics. Calibration is the Brier score of the verification
// probability against what a person decided (fixed, accepted or
// not-worth-it = real). Noise is the share of disposed findings that people
// said were wrong, intended or not worth fixing. Rounds per ledger is the
// convergence measure: how many reviews it took.
export function summarize(ledgers) {
  const all = ledgers.flatMap((l) => l.findings.map((f) => ({ ...f, repo: l.repo, ledger: `${l.repo}#${l.key}` })));
  const reported = all.filter((f) => f.reported && !f.duplicateOf);
  const disposed = reported.filter((f) => f.disposition);
  const noise = disposed.filter((f) => NOISE.has(f.disposition.as));
  const scored = all.filter((f) => f.disposition && f.decisions["finding-verification"]);
  const brier = scored.length
    ? scored.reduce((sum, f) => {
        const real = REAL.has(f.disposition.as) ? 1 : 0;
        return sum + (f.decisions["finding-verification"].probability - real) ** 2;
      }, 0) / scored.length
    : null;
  const families = new Set(ledgers.flatMap((l) => l.rounds.flatMap((r) => roundFamilies(l, r.round))));
  const dispositions = {};
  for (const f of disposed) dispositions[f.disposition.as] = (dispositions[f.disposition.as] ?? 0) + 1;
  const byLens = {};
  for (const f of reported) {
    const s = (byLens[f.lens] ??= { reported: 0, disposed: 0, noise: 0 });
    s.reported += 1;
    if (f.disposition) s.disposed += 1;
    if (f.disposition && NOISE.has(f.disposition.as)) s.noise += 1;
  }
  for (const s of Object.values(byLens)) s.noiseRate = rate(s.noise, s.disposed);
  // By depth and by the model that wrote each finding, so the defaults for
  // each depth can be tuned from what people decided.
  const tally = (key) => {
    const out = {};
    for (const f of reported) {
      const k = key(f) ?? "unknown";
      const s = (out[k] ??= { reported: 0, disposed: 0, fixed: 0, noise: 0 });
      s.reported += 1;
      if (f.disposition) s.disposed += 1;
      if (f.disposition && ["fixed", "accepted"].includes(f.disposition.as)) s.fixed += 1;
      if (f.disposition && NOISE.has(f.disposition.as)) s.noise += 1;
    }
    for (const s of Object.values(out)) s.noiseRate = rate(s.noise, s.disposed);
    return out;
  };
  const roundDepth = new Map(ledgers.flatMap((l) => l.rounds.map((r) => [`${l.repo}#${l.key}:${r.round}`, r.depth ?? null])));
  const byDepth = tally((f) => roundDepth.get(`${f.ledger}:${f.round}`) ?? "unrecorded");
  const byModel = tally((f) => f.model);
  const rounds = ledgers.map((l) => l.rounds.length).filter(Boolean);
  return {
    ledgers: ledgers.length,
    rounds: rounds.reduce((n, r) => n + r, 0),
    roundsPerLedger: rounds.length ? rounds.reduce((n, r) => n + r, 0) / rounds.length : null,
    oneRoundShare: rate(rounds.filter((r) => r === 1).length, rounds.length),
    pastCapShare: rate(rounds.filter((r) => r > MAX_ROUNDS).length, rounds.length),
    findings: all.length,
    reported: reported.length,
    reportedPerLedger: ledgers.length ? reported.length / ledgers.length : 0,
    disposed: disposed.length,
    dispositions,
    noiseRate: rate(noise.length, disposed.length),
    byLens,
    byDepth,
    byModel,
    verificationBrier: brier,
    modelFamilies: [...families].sort(),
    repeatedClasses: repeatedClasses(reported),
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

