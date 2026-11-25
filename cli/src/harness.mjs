// The bridge to the review harness (agent-review). The harness owns the
// review workflow: what each step needs, who may do it, and what counts. This
// module only adapts it for the skills:
//
//   - The skills' CLI hands review, eligibility, merge and inbox commands to
//     the harness unchanged, except that it fills in model families. The
//     harness takes a family from the provider prefix, and the skills know
//     gateways (glean/CLAUDE..., openrouter/...) that serve many families.
//   - harnessLedger() presents a harness review in the shape of a v1 ledger,
//     so the report sections, repeats and summary code works on both. It is
//     a read-only view; every change goes through the harness.
//
// The view keeps the harness's internal keys (id, duplicateOf), because the
// repeat and summary code joins on them. What this module prints never has
// one: a finding is named by the number the harness's report gave it, and a
// candidate by its candidate number. Only a v1 finding, from before the
// harness, has no number, and is named by its v1 ID.

import { listReviews, openReview } from "agent-review";
import { cliStateRoot, main as harnessMain } from "agent-review/cli";
import { LedgerError, SECTION_ORDER, allInstances, family, foundBy, load as loadLegacy, openFindings, placement, possibleRepeats, recurrences, roundFamilies } from "./review-ledger.mjs";

// Top-level commands that belong to the harness.
export const HARNESS_COMMANDS = {
  review: "The review workflow: start, run, merge, decide, report, dispose, link, next, status and policy. Run review --help for the commands.",
  eligibility: "Whether a reviewed change may merge under the repo's policy. Never merges.",
  merge: "merge dry-run: what a merge would do, after a fresh recheck. Never merges.",
  inbox: "Everything waiting on a person, across reviews.",
};

// Fill in a family the caller did not give, for each model the command
// names. A family the caller gives wins.
const FAMILY_FLAGS = { "--model": "--family", "--verifier-model": "--verifier-family", "--classifier-model": "--classifier-family" };

// The last occurrence wins, as it does in the harness's argument parser, so
// the family always belongs to the model the harness records.
function value(args, flag) {
  let found;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) found = args[i + 1];
    else if (args[i].startsWith(`${flag}=`)) found = args[i].slice(flag.length + 1);
  }
  return found;
}

// Only a family the skills know better than the harness is passed: a known
// model behind a gateway. Anything else, the harness infers the same way.
export function withFamilies(args) {
  const out = [...args];
  for (const [modelFlag, familyFlag] of Object.entries(FAMILY_FLAGS)) {
    const model = value(args, modelFlag);
    if (model && value(args, familyFlag) === undefined) {
      const fam = family(model);
      if (fam && fam !== String(model).split("/")[0].toLowerCase()) out.push(familyFlag, fam);
    }
  }
  return out;
}

// The harness calls its review-policy check "policy check". The skills'
// "policy" command is the permission rules, so here it is "review policy".
function translate(args) {
  if (args[0] === "review" && args[1] === "policy") return ["policy", "check", ...args.slice(2)];
  return args;
}

// review, review --help and review help print the harness's commands, with
// its "policy check" shown under the name it has here, and exit 0.
function help(io = {}) {
  let text = "";
  harnessMain(["--help"], { ...io, stdout: { write: (s) => (text += s) } });
  (io.stdout ?? process.stdout).write(text.replace(/^(\s+)policy check(\s*)/m, (_, a, b) => `${a}review policy${b.slice(1)}`));
  return 0;
}

export function runHarness(args, io) {
  if (args[0] === "review" && (args.length === 1 || ["-h", "--help", "help"].includes(args[1]))) return help(io);
  return harnessMain(withFamilies(translate(args)), io);
}

export const stateRoot = () => cliStateRoot();

// A finding the report shows: in the round's report, or disputed and
// approved by a person.
function reportedIn(state, f) {
  const r = state.rounds[f.round];
  if (!r?.report) return false;
  if (r.report.reported.includes(f.id)) return true;
  return r.report.escalated.includes(f.id) && state.escalations.some((x) => x.finding === f.id && x.round === f.round && x.status === "approved");
}

// One decision per kind, as a v1 ledger holds it. Agreeing verifiers are
// summed up by the least sure one, as the harness's report gate does; for
// the other kinds the latest decision stands.
function decisionsOf(f) {
  const out = {};
  for (const [kind, list] of Object.entries(f.decisions)) {
    if (!list.length) continue;
    const d = kind === "finding-verification" ? list.reduce((a, b) => (b.probability < a.probability ? b : a)) : list.at(-1);
    out[kind] = { label: d.label, probability: d.probability, model: d.verifier.model, family: d.verifier.family ?? null, rationale: d.rationale, verifiers: list.length };
  }
  return out;
}

export function harnessLedger(state, ref) {
  const rounds = Object.values(state.rounds)
    .sort((a, b) => a.round - b.round)
    .map((r) => {
      const lensOf = Object.fromEntries(r.plan.slots.map((s) => [s.id, s.lens]));
      return {
        round: r.round,
        status: r.status,
        base: r.binding.mergeBase,
        head: r.binding.head,
        target: r.binding.target,
        lenses: [...new Set(r.plan.slots.map((s) => s.lens))],
        depth: r.depth?.depth ?? null,
        pastCap: r.pastCap ?? false,
        runs: Object.entries(r.runs)
          .filter(([, run]) => run.status === "ok")
          .map(([slot, run]) => ({ slot, lens: lensOf[slot], model: run.model, family: run.family })),
      };
    });
  // A primary merged into another primary leaves a chain (F3 -> F2 -> F1).
  // Every duplicate points at the top of its chain, so its places count.
  const byId = new Map(state.findings.map((f) => [f.id, f]));
  const top = (id) => {
    const seen = new Set();
    while (byId.get(id)?.duplicateOf && !seen.has(id)) {
      seen.add(id);
      id = byId.get(id).duplicateOf;
    }
    return id;
  };
  // The section each finding's report put it in. The harness numbered the
  // report in this order, so numbers and sections always agree.
  const sectionOf = new Map(Object.values(state.rounds).flatMap((r) => (r.report?.numbers ?? []).map((x) => [x.finding, x.section])));
  const findings = state.findings.map((f) => ({
    id: f.id,
    number: f.number ?? null,
    candidate: f.candidate ?? null,
    reportSection: sectionOf.get(f.id) ?? null,
    round: f.round,
    lens: f.lens,
    model: f.author.model,
    family: f.author.family,
    file: f.file,
    line: f.line,
    title: f.title,
    precondition: f.precondition,
    scenario: f.scenario,
    evidence: f.evidence,
    class: f.class ?? null,
    instances: f.instances ?? [],
    axiom: f.axiom ?? null,
    duplicateOf: f.duplicateOf ? top(f.duplicateOf) : null,
    decisions: decisionsOf(f),
    reported: reportedIn(state, f),
    disposition: f.disposition ? { as: f.disposition.as, note: f.disposition.note, at: f.disposition.at, by: f.disposition.actor } : null,
    thread: f.thread ? { id: f.thread.id, url: f.thread.url, at: f.thread.at } : null,
  }));
  return { schema: "agent-review.view/v1", repo: ref.repo, key: String(ref.key), rounds, findings, escalations: state.escalations };
}

// One view of a change's whole review: its v1 ledger, from before the
// harness, then the harness's rounds, numbered after the v1 rounds. v1
// finding IDs get a v1: prefix, because both start at F1. A v1 finding is
// closed with ledger dispose; a harness finding with review dispose.
export function combineViews(legacy, view, ref) {
  const v1Rounds = legacy?.rounds ?? [];
  const offset = Math.max(0, ...v1Rounds.map((r) => r.round ?? 0));
  const v1 = (id) => (id ? `v1:${id}` : null);
  return {
    schema: "agent-review.view/v1",
    repo: ref.repo,
    key: String(ref.key),
    rounds: [
      ...v1Rounds.map((r) => ({ ...r, source: "v1" })),
      ...(view?.rounds ?? []).map((r) => ({ ...r, round: r.round + offset, source: "harness" })),
    ],
    findings: [
      ...(legacy?.findings ?? []).map((f) => ({ ...f, id: v1(f.id), duplicateOf: v1(f.duplicateOf), source: "v1" })),
      ...(view?.findings ?? []).map((f) => ({ ...f, round: f.round + offset, source: "harness" })),
    ],
    escalations: (view?.escalations ?? []).map((x) => ({ ...x, round: x.round + offset })),
  };
}

export function loadHarness(repo, key, root = stateRoot()) {
  const ref = { repo, key: String(key) };
  const state = openReview(root, ref).read();
  return { state, ledger: combineViews(loadLegacy(repo, key), harnessLedger(state, ref), ref) };
}

// Every change's review, as one combined view each, for the summary. A
// change reviewed before and after the harness counts once. A review this
// build cannot read is counted in `unreadable`, not allowed to hide the rest.
export function allReviewViews(legacyLedgers, root = stateRoot()) {
  const byKey = new Map();
  const at = (ref) => {
    const k = `${ref.repo}#${ref.key}`;
    if (!byKey.has(k)) byKey.set(k, { ref: { repo: ref.repo, key: String(ref.key) }, legacy: null, view: null });
    return byKey.get(k);
  };
  for (const l of legacyLedgers) at(l).legacy = l;
  const unreadable = [];
  for (const ref of listReviews(root)) {
    try {
      at(ref).view = harnessLedger(openReview(root, ref).read(), ref);
    } catch (e) {
      unreadable.push({ repo: ref.repo, key: ref.key, error: e.code ?? e.message });
    }
  }
  return { ledgers: [...byKey.values()].map((x) => combineViews(x.legacy, x.view, x.ref)), unreadable };
}

// The report a person reads, for the harness's latest round: findings in
// sections and in order, numbered, with every place each one covers. The
// harness decided which findings are reported; this only arranges them, and
// never leaves one out.
//
// A reported finding near an earlier one, or with the same bug class, is
// marked: `repeatOf` when the earlier one is still open or a person called it
// wrong, intended or not worth fixing, so the person can see it may not be
// new; `recurs` when the earlier one was marked fixed, because the fix may
// not have held. Both are hints from location and class, not proof, so the
// finding stays in its section and counts toward the verdict.
export function presentReport(state, view) {
  const current = view.rounds.at(-1);
  if (!current || current.source !== "harness") throw new LedgerError("this review has no harness rounds; start one with review start");
  if (current.status !== "reported") {
    throw new LedgerError(`round ${current.round} is ${current.status}, not reported; run review next to see what it needs`);
  }
  const round = current.round;
  const shown = view.findings.filter((f) => f.round === round && f.reported && !f.duplicateOf);
  const earlierOf = (f) => possibleRepeats(view, f).map((e) => ({ ...named(e), disposition: e.disposition?.as ?? "open" }));
  // The harness numbered the report in section order, so its numbers are the
  // report order.
  shown.sort((a, b) => a.number - b.number);
  const findings = shown.map((f) => ({
    ...publicFinding(f),
    // n is the number the harness gave this finding. It names the finding in
    // this conversation and in commands, for the whole review.
    n: f.number,
    ...placement(f),
    section: f.reportSection ?? placement(f).section,
    instances: allInstances(view, f),
    repeatOf: earlierOf(f),
    recurs: recurrences(view, f).map(named),
    foundBy: foundBy(view, f),
  }));
  const tally = (list) => {
    const out = Object.fromEntries(Object.keys(SECTION_ORDER).map((s) => [s, 0]));
    for (const f of list) out[f.section] += 1;
    return out;
  };
  const counts = tally(findings);
  const earlierOpen = tally(openFindings(view).filter((f) => f.round < round).map(placement));
  const holding = (c) => c.blockers + c["should-fix"] + c.unrated;
  // What waits on a person, as the harness's next step sees it: open
  // escalations (disputed findings, policy changes, escalation paths), and
  // reported findings triaged needs-judgment that nobody has closed.
  const numberOf = (id) => view.findings.find((f) => f.source === "harness" && f.id === id)?.number ?? null;
  const waiting = [
    ...view.escalations
      .filter((x) => x.round === round && x.status === "open")
      .map((x) => ({ escalation: x.id, code: x.code, finding: x.finding ? numberOf(x.finding) : null, path: x.path, message: x.message })),
    ...openFindings(view)
      .filter((f) => f.source === "harness" && !f.disposition && f.decisions["finding-triage"]?.label === "needs-judgment")
      .map((f) => ({ escalation: null, code: "needs-judgment", finding: f.number, path: null, message: `${f.title}: a person decides what to do about it` })),
  ];
  // A person rejected a policy change or a change to an escalation path. It
  // blocks, as it does in the harness's eligibility. A rejected dispute about
  // a finding only means the finding is not a problem.
  const rejected = view.escalations
    .filter((x) => x.round === round && x.status === "rejected" && !x.finding)
    .map((x) => ({ escalation: x.id, code: x.code, path: x.path, message: x.message, reason: x.resolution?.reason ?? null, by: x.resolution?.actor ?? null }));
  const escalated = new Set(view.escalations.filter((x) => x.round === round && x.finding).map((x) => x.finding));
  // Dropped and merged candidates, by candidate number. They have no finding
  // number, and the report leaves them out.
  const thisRound = view.findings.filter((f) => f.round === round && f.source === "harness");
  const dropped = thisRound.filter((f) => !f.duplicateOf && !f.reported && !escalated.has(f.id)).map((f) => f.candidate);
  return {
    round,
    head: current.head,
    depth: current.depth,
    // needs-a-person: something waits on a person. needs-changes: a
    // rejected escalation, or a blocker, should-fix or unrated finding, new
    // or still open from earlier.
    verdict: waiting.length ? "needs-a-person" : rejected.length || holding(counts) + holding(earlierOpen) > 0 ? "needs-changes" : "ready",
    counts,
    earlierOpen,
    findings,
    waiting,
    rejected,
    repeats: findings.filter((f) => f.repeatOf.length).map((f) => ({ n: f.n, earlier: f.repeatOf })),
    dropped,
    merged: thisRound.filter((f) => f.duplicateOf).map((f) => f.candidate),
    lenses: current.lenses,
    families: roundFamilies(view, round),
  };
}

// An earlier finding, as a report or command needs it: its number, or for a
// v1 finding its v1 ID, and what and where it is.
function named(f) {
  const name = f.source === "v1" ? { n: null, v1Id: f.id.replace(/^v1:/, "") } : { n: f.number };
  return { ...name, round: f.round, title: f.title, file: f.file, line: f.line ?? null };
}

// A finding without the harness's internal keys.
function publicFinding(f) {
  const { id, duplicateOf, number, candidate, reportSection, ...rest } = f;
  return rest;
}

// Reported findings from any round that nobody has closed yet, by number.
// A v1 finding, from before the harness, has no number: close it with
// ledger dispose --id <v1Id>.
export function presentOpen(view) {
  return openFindings(view).map((f) => ({ ...named(f), source: f.source, scenario: f.scenario, thread: f.thread?.id ?? null }));
}
