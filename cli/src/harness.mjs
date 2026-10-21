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

import { listReviews, openReview } from "agent-review";
import { cliStateRoot, main as harnessMain } from "agent-review/cli";
import { LedgerError, SECTION_ORDER, allInstances, family, foundBy, openFindings, placement, possibleRepeats, recurrences, roundFamilies } from "./review-ledger.mjs";

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

function value(args, flag) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) return args[i + 1];
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
  }
  return undefined;
}

export function withFamilies(args) {
  const out = [...args];
  for (const [modelFlag, familyFlag] of Object.entries(FAMILY_FLAGS)) {
    const model = value(args, modelFlag);
    if (model && value(args, familyFlag) === undefined) {
      const fam = family(model);
      if (fam) out.push(familyFlag, fam);
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

export function runHarness(args, io) {
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
    out[kind] = { label: d.label, probability: d.probability, model: d.verifier.model, rationale: d.rationale, verifiers: list.length };
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
  const findings = state.findings.map((f) => ({
    id: f.id,
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
    duplicateOf: f.duplicateOf,
    decisions: decisionsOf(f),
    reported: reportedIn(state, f),
    disposition: f.disposition ? { as: f.disposition.as, note: f.disposition.note, at: f.disposition.at, by: f.disposition.actor } : null,
    thread: f.thread ? { id: f.thread.id, url: f.thread.url, at: f.thread.at } : null,
  }));
  return { schema: "agent-review.view/v1", repo: ref.repo, key: String(ref.key), rounds, findings, escalations: state.escalations };
}

export function loadHarness(repo, key, root = stateRoot()) {
  const ref = { repo, key: String(key) };
  const state = openReview(root, ref).read();
  return { state, ledger: harnessLedger(state, ref) };
}

// Every harness review, as views, for the summary. A review this build cannot
// read is counted in `unreadable`, not allowed to hide the rest.
export function allHarnessLedgers(root = stateRoot()) {
  const ledgers = [];
  const unreadable = [];
  for (const ref of listReviews(root)) {
    try {
      ledgers.push(harnessLedger(openReview(root, ref).read(), ref));
    } catch (e) {
      unreadable.push({ repo: ref.repo, key: ref.key, error: e.code ?? e.message });
    }
  }
  return { ledgers, unreadable };
}

// The report a person reads, for the harness's latest round: findings in
// sections and in order, numbered, with every place each one covers. The
// harness decided which findings are reported; this only arranges them.
//
// A reported finding that repeats an earlier one that is still open, or that
// a person called wrong, intended or not worth fixing, is left out and
// listed in `repeats`: it is not new. One that matches an earlier finding
// marked fixed stays in, with `recurs`, because the fix did not hold.
export function presentReport(state, view) {
  const current = view.rounds.at(-1);
  if (!current) throw new LedgerError("this review has no rounds; start one with review start");
  if (current.status !== "reported") {
    throw new LedgerError(`round ${current.round} is ${current.status}, not reported; run review next to see what it needs`);
  }
  const round = current.round;
  const reported = view.findings.filter((f) => f.round === round && f.reported && !f.duplicateOf);
  const repeats = [];
  const shown = [];
  for (const f of reported) {
    const earlier = possibleRepeats(view, f);
    if (earlier.length) repeats.push({ id: f.id, file: f.file, line: f.line, title: f.title, earlier: earlier.map((e) => ({ id: e.id, round: e.round, disposition: e.disposition?.as ?? "open" })) });
    else shown.push(f);
  }
  const placed = new Map(shown.map((f) => [f, placement(f)]));
  shown.sort(
    (a, b) =>
      SECTION_ORDER[placed.get(a).section] - SECTION_ORDER[placed.get(b).section] ||
      String(a.file).localeCompare(String(b.file)) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
  const findings = shown.map((f, i) => ({
    ...f,
    // n is the number a person sees (1, 2, 3). The id is the harness's key
    // for later commands; it is never shown.
    n: i + 1,
    ...placed.get(f),
    instances: allInstances(view, f),
    recurs: recurrences(view, f).map((e) => ({ id: e.id, round: e.round, file: e.file, line: e.line ?? null })),
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
  // Open escalations: disputed findings, policy changes and escalation
  // paths. A person settles each one before the change is ready.
  const waiting = view.escalations
    .filter((x) => x.round === round && x.status === "open")
    .map((x) => ({ escalation: x.id, code: x.code, finding: x.finding, path: x.path, message: x.message }));
  const dropped = view.findings.filter((f) => f.round === round && !f.duplicateOf && !f.reported && !waiting.some((w) => w.finding === f.id)).map((f) => f.id);
  return {
    round,
    head: current.head,
    depth: current.depth,
    // needs-a-person: an escalation is open. needs-changes: a blocker,
    // should-fix or unrated finding, new or still open from earlier.
    verdict: waiting.length ? "needs-a-person" : holding(counts) + holding(earlierOpen) === 0 ? "ready" : "needs-changes",
    counts,
    earlierOpen,
    findings,
    waiting,
    repeats,
    dropped,
    merged: view.findings.filter((f) => f.round === round && f.duplicateOf).map((f) => f.id),
    lenses: current.lenses,
    families: roundFamilies(view, round),
  };
}

// Reported findings from any round that nobody has closed yet.
export function presentOpen(view) {
  return openFindings(view).map((f) => ({ id: f.id, round: f.round, file: f.file, line: f.line, title: f.title, scenario: f.scenario, thread: f.thread?.id ?? null }));
}
