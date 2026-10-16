// The agent-review command line: one program over the review modules.
//
// Exit codes match the scripts this replaced: 0 on success, 1 when `prose`
// flags something, 2 for a usage error or a failed command. The guard is a
// separate entry (guard.mjs), because hooks and Tau shims call it on every
// tool call and it must start fast.

import { readFileSync } from "node:fs";
import { Command, CommanderError, Option } from "commander";
import { check as checkProse } from "./check-prose.mjs";
import { KINDS, check as checkDecision, rubricText } from "./classify.mjs";
import { PRESETS, checkCommand, checkTool, load as loadPermissions, writeCodexRules, writeShims } from "./permissions.mjs";
import { pin } from "./review-context.mjs";
import * as ledger from "./review-ledger.mjs";
import { listThreads, owner } from "./review-threads.mjs";
import { VIAS, lensPrompt, runLens } from "./run-lens.mjs";

// The build defines __AGENT_REVIEW_VERSION__; from source, read package.json.
/* global __AGENT_REVIEW_VERSION__ */
const VERSION =
  typeof __AGENT_REVIEW_VERSION__ === "string"
    ? __AGENT_REVIEW_VERSION__
    : JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

const print = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
const list = (s) => (s ? String(s).split(",").filter(Boolean) : []);

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

export function buildProgram(state = { exitCode: 0 }) {
  const program = new Command("agent-review")
    .description("Pin, run, record and gate agent code reviews, and check what an agent may do in a repo.")
    .version(VERSION)
    .enablePositionalOptions()
    .showHelpAfterError("(run with --help for usage)")
    .exitOverride();

  program
    .command("pin")
    .description("Pin a change into one directory (diff, files, commits, spec, AGENTS.md, REVIEW.md, axioms) and pick its lenses. Prints context.json.")
    .option("--pr <number>", "pin a pull request")
    .option("--base <ref>", "base ref for a local branch (default: origin/HEAD)")
    .option("--since <sha>", "pin only the commits after this one (a follow-up round)")
    .option("--out <dir>", "output directory (default: a new temp dir)")
    .action((o) => print(pin(o)));

  const lens = program.command("lens").description("Review lens prompts, and running a lens on another model family.");
  lens
    .command("prompt <lens>")
    .description("Print the prompt a reviewer gets for one lens.")
    .requiredOption("--context <dir>", "directory written by pin")
    .action((name, o) => print(lensPrompt(name, o.context)));
  lens
    .command("run <lens>")
    .description("Run one lens through another model's CLI and print its findings as JSON.")
    .addOption(new Option("--via <cli>", "model CLI to run").choices(VIAS).makeOptionMandatory())
    .requiredOption("--context <dir>", "directory written by pin")
    .option("--model <id>", "model to ask for")
    .option("--repo-dir <path>", "repository the model may read (default: cwd)")
    .action((name, o) => print(runLens(name, { via: o.via, context: o.context, model: o.model, repoDir: o.repoDir })));

  const led = program.command("ledger").description("The review ledger: rounds, findings, decisions and dispositions for one PR or branch.");
  const keyed = (name, description) =>
    led
      .command(name)
      .description(description)
      .requiredOption("--repo <owner/repo>", "repository")
      .requiredOption("--key <pr|branch>", "PR number or branch name");
  const withLedger = (fn) => (o) => {
    const l = ledger.load(o.repo, o.key);
    const result = fn(l, o);
    ledger.save(l);
    print(result);
  };

  keyed("path", "Print the ledger file path.").action((o) => print(ledger.ledgerPath(o.repo, o.key)));
  keyed("start", "Start a review round.")
    .requiredOption("--base <sha>", "merge base")
    .requiredOption("--head <sha>", "reviewed head")
    .option("--lenses <a,b>", "lenses chosen for this round")
    .option("--models <m1,m2>", "models planned for this round")
    .action(
      withLedger((l, o) => ({
        round: ledger.startRound(l, { base: o.base, head: o.head, lenses: list(o.lenses), models: list(o.models) }),
        path: ledger.ledgerPath(o.repo, o.key),
      })),
    );
  keyed("add", "Add findings from a file, or from JSON on stdin.")
    .option("--file <findings.json>", "findings file")
    .action(async (o) => {
      const text = o.file ? readFileSync(o.file, "utf8") : await readStdin();
      withLedger((l) => ({ added: ledger.addFindings(l, JSON.parse(text)) }))(o);
    });
  keyed("decide", "Record a classifier decision for a finding.")
    .requiredOption("--id <F1>", "finding ID")
    .requiredOption("--kind <kind>", `decision kind: ${Object.keys(KINDS).join(", ")}`)
    .requiredOption("--json <decision>", "the decision as JSON")
    .action(withLedger((l, o) => ledger.decide(l, o.id, o.kind, JSON.parse(o.json))));
  keyed("ran", "Record that a lens ran on a model.")
    .requiredOption("--lens <lens>", "lens name")
    .requiredOption("--model <provider/model>", "model that ran it")
    .option("--findings <n>", "findings it reported")
    .action(
      withLedger((l, o) => {
        ledger.recordRun(l, { lens: o.lens, model: o.model, findings: o.findings });
        return { lens: o.lens, model: o.model };
      }),
    );
  keyed("merge", "Merge duplicate findings into one primary (same root cause).")
    .requiredOption("--into <F1>", "primary finding")
    .requiredOption("--ids <F4,F7>", "duplicates")
    .action(withLedger((l, o) => ({ into: o.into, foundBy: ledger.mergeFindings(l, o.into, list(o.ids)) })));
  keyed("report", "Gate and print the confirmed findings for the current round.")
    .option("--threshold <p>", "minimum verification probability", String(ledger.DEFAULT_THRESHOLD))
    .option("--allow-missing", "report even when a chosen lens has no recorded run")
    .action(withLedger((l, o) => ledger.report(l, Number(o.threshold), { allowMissing: o.allowMissing === true })));
  keyed("dispose", "Record what a person decided about a finding.")
    .requiredOption("--id <F1>", "finding ID")
    .addOption(new Option("--as <disposition>", "disposition").choices(["accepted", "fixed", "dismissed", "wont-fix"]).makeOptionMandatory())
    .option("--note <text>", "why")
    .action(
      withLedger((l, o) => {
        ledger.dispose(l, o.id, o.as, o.note);
        return { id: o.id, disposition: o.as };
      }),
    );
  keyed("open", "List findings reported in any round and not yet closed.").action((o) =>
    print(
      ledger
        .openFindings(ledger.load(o.repo, o.key))
        .map((f) => ({ id: f.id, round: f.round, file: f.file, line: f.line, title: f.title, scenario: f.scenario })),
    ),
  );
  keyed("last-head", "Print the head reviewed in the last round.").action((o) => print(ledger.load(o.repo, o.key).rounds.at(-1)?.head ?? ""));
  led
    .command("summary")
    .description("Summarize dispositions and calibration for one ledger, or every ledger.")
    .option("--repo <owner/repo>", "repository")
    .option("--key <pr|branch>", "PR number or branch name")
    .action((o) => print(ledger.summarize(o.repo ? [ledger.load(o.repo, o.key)] : ledger.allLedgers())));

  const rubric = program.command("rubric").description("Rubrics for the judgments the review skills make, and a validator for the answers.");
  rubric
    .command("list")
    .description("List decision kinds and their labels.")
    .action(() => {
      for (const [name, spec] of Object.entries(KINDS)) console.log(`${name}: ${spec.labels.join(" | ")}`);
    });
  rubric
    .command("show <kind>")
    .description("Print the rubric for one kind.")
    .action((kind) => print(rubricText(kind)));
  rubric
    .command("check <kind> <json>")
    .description("Validate an agent's decision against a kind's labels.")
    .action((kind, json) => console.log(JSON.stringify(checkDecision(kind, JSON.parse(json)))));

  const policy = program
    .command("policy")
    .description("Repo permission rules (Claude Code syntax in .claude/settings.json): check, lint, compile and presets.")
    .enablePositionalOptions();
  policy
    .command("preset <name>")
    .description(`Print a preset: ${Object.keys(PRESETS).join(", ")}.`)
    .action((name) => {
      if (!PRESETS[name]) throw new Error(`unknown preset "${name}"; expected ${Object.keys(PRESETS).join(", ")}`);
      print({ permissions: PRESETS[name] });
    });
  policy
    .command("check [command...]")
    .description("Print allow, ask or deny for a command (after --) or a tool.")
    .option("--settings <file>", "settings file (default: the repo's .claude/settings.json)")
    .option("--tool <name>", "check a tool instead of a command")
    .option("--json", "print the matched rule and source as JSON")
    .passThroughOptions()
    .action((command, o) => {
      const { permissions, source } = loadPermissions(o.settings);
      let result;
      if (o.tool) result = checkTool(permissions, o.tool);
      else if (command.length) result = checkCommand(permissions, command.join(" "));
      else throw new Error("check needs a command after -- or --tool <name>");
      if (o.json) console.log(JSON.stringify({ ...result, source }));
      else console.log(result.decision);
    });
  policy
    .command("lint")
    .description("Validate the repo's permission rules.")
    .option("--settings <file>", "settings file")
    .action((o) => console.log(`ok: ${loadPermissions(o.settings).source}`));
  policy
    .command("compile")
    .description("Compile the rules to Codex prefix rules. Rules Codex cannot express are left to the guard hook.")
    .option("--settings <file>", "settings file")
    .requiredOption("--codex <out.rules>", "output file")
    .action((o) => {
      const { out, skipped } = writeCodexRules(o.settings, o.codex);
      console.log(`wrote ${out}; ${skipped.length} rules left to the guard hook`);
    });
  policy
    .command("shim <dir>")
    .description("Write gh, git and npm PATH shims for Tau that call the guard.")
    .action((dir) => {
      for (const f of writeShims(dir)) console.log(f);
    });

  const threads = program.command("threads").description("Read-only helpers for answering PR review threads.");
  threads
    .command("list")
    .description("Unresolved review threads, oldest first.")
    .requiredOption("--pr <number>", "pull request")
    .option("--repo <owner/repo>", "repository (default: the current one)")
    .option("--all", "include resolved threads")
    .action((o) => print(listThreads(o)));
  threads
    .command("owner")
    .description("The commit that last changed a line, and the open PR that contains it.")
    .requiredOption("--path <file>", "file")
    .requiredOption("--line <n>", "line")
    .option("--repo <owner/repo>", "repository (default: the current one)")
    .action((o) => print(owner(o)));

  program
    .command("prose [files...]")
    .description("Check prose for the write-clearly rules. Reads stdin when no files are given. Exits 1 when anything is flagged.")
    .option("--json", "print findings as JSON")
    .action(async (files, o) => {
      const inputs = files.length ? files.map((f) => [f, readFileSync(f, "utf8")]) : [["<stdin>", await readStdin()]];
      const all = inputs.flatMap(([file, text]) => checkProse(text).map((f) => ({ file, ...f })));
      if (o.json) console.log(JSON.stringify(all, null, 2));
      else for (const f of all) console.log(`${f.file}:${f.line}: ${f.rule}: ${f.excerpt}`);
      if (!o.json && all.length === 0) console.log("prose: OK");
      if (all.length) state.exitCode = 1;
    });

  program.hook("preAction", (_, action) => {
    const names = [];
    for (let c = action; c; c = c.parent) names.unshift(c.name());
    state.label = names.join(" ");
  });
  return program;
}

// Runs the program and returns the exit code instead of exiting, so tests can
// call it in-process.
export async function run(argv) {
  const state = { exitCode: 0, label: "agent-review" };
  try {
    await buildProgram(state).parseAsync(argv);
    return state.exitCode;
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode === 0 ? 0 : 2;
    console.error(`${state.label}: ${err.stderr?.toString().trim() || err.message}`);
    return 2;
  }
}
