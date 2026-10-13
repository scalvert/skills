#!/usr/bin/env node
// One interface for every judgment the review skills make:
//
//   classify(kind, input) -> { label, probability }
//
// v1 has one backend, "agent": the running agent (or a subagent it starts)
// makes the call with the rubric below and passes the JSON here, which checks
// it against the kind's labels. Every decision is written to the review ledger
// together with what a person later decided, which builds the labeled data
// needed to try other backends (a small local model, or a self-hosted
// open-source classifier) and to calibrate their probabilities.
//
// Usage:
//   classify.mjs kinds                       list kinds, labels and rubrics
//   classify.mjs rubric <kind>               print one rubric
//   classify.mjs check <kind> '<json>'       validate an agent decision

import { pathToFileURL } from "node:url";

export const KINDS = {
  "finding-verification": {
    labels: ["confirmed", "refuted", "unclear"],
    rubric:
      "Decide whether the finding is real. Read the code yourself; do not trust the finding's own evidence. " +
      "confirmed: the precondition can occur and you can show the call path or a repro that reaches the problem. " +
      "refuted: the precondition cannot occur, or the code already handles it. Name the line that handles it. " +
      "unclear: you cannot show either. probability is your confidence that the finding is real (0 to 1), " +
      "independent of the label wording.",
  },
  "finding-triage": {
    labels: ["agent-fixable", "needs-judgment"],
    rubric:
      "agent-fixable: one correct fix exists, it is local, and the author would accept it without discussion " +
      "(a missing null check, a wrong constant, a missing test for changed behavior). " +
      "needs-judgment: the fix involves a tradeoff, a product or API decision, or more than one reasonable answer. " +
      "probability is your confidence in the label.",
  },
  "finding-severity": {
    labels: ["blocker", "should-fix", "nit"],
    rubric:
      "blocker: wrong behavior, data loss, a security problem, or a broken public contract. " +
      "should-fix: changed behavior without a test, an unclear name in a public API, or a likely future bug. " +
      "nit: anything else. A repo's REVIEW.md severity rules override these. probability is your confidence.",
  },
  "tool-effect": {
    labels: ["external-write", "read-only", "unclear"],
    rubric:
      "external-write: the call changes state outside this machine (posts, merges, sends, publishes, deletes). " +
      "read-only: it only reads. unclear: you cannot tell from the tool name, description and arguments.",
  },
};

export const BACKENDS = ["agent"];

export class ClassifyError extends Error {}

export function check(kind, decision) {
  const spec = KINDS[kind];
  if (!spec) throw new ClassifyError(`unknown kind "${kind}"; expected ${Object.keys(KINDS).join(", ")}`);
  if (decision === null || typeof decision !== "object") throw new ClassifyError("decision must be an object");
  const { label, probability } = decision;
  if (!spec.labels.includes(label)) {
    throw new ClassifyError(`label "${label}" is not one of ${spec.labels.join(", ")} for ${kind}`);
  }
  if (typeof probability !== "number" || Number.isNaN(probability) || probability < 0 || probability > 1) {
    throw new ClassifyError("probability must be a number from 0 to 1");
  }
  const backend = decision.backend ?? "agent";
  if (!BACKENDS.includes(backend)) throw new ClassifyError(`unknown backend "${backend}"`);
  const out = { kind, label, probability, backend };
  if (decision.model) out.model = String(decision.model);
  if (decision.rationale) out.rationale = String(decision.rationale);
  return out;
}

function main(argv) {
  const [cmd, kind, json] = argv;
  if (cmd === "kinds") {
    for (const [name, spec] of Object.entries(KINDS)) console.log(`${name}: ${spec.labels.join(" | ")}`);
    return 0;
  }
  if (cmd === "rubric" && KINDS[kind]) {
    console.log(`${kind} (${KINDS[kind].labels.join(" | ")})\n\n${KINDS[kind].rubric}`);
    console.log('\nAnswer with JSON: {"label": "...", "probability": 0.0, "rationale": "one sentence"}');
    return 0;
  }
  if (cmd === "check") {
    console.log(JSON.stringify(check(kind, JSON.parse(json))));
    return 0;
  }
  console.error("usage: classify.mjs kinds | rubric <kind> | check <kind> '<json>'");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error(`classify: ${err.message}`);
    process.exit(2);
  }
}
