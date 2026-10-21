// The agent-review command line: one program over the review modules.
//
// Exit codes match the scripts this replaced: 0 on success, 1 when `prose`
// flags something, 2 for a usage error or a failed command. The guard is a
// separate entry (guard.mjs), because hooks and Tau shims call it on every
// tool call and it must start fast.

import { readFileSync } from "node:fs";
import { Command, CommanderError, Option } from "commander";
import { check as checkProse, checkGithub } from "./check-prose.mjs";
import { KINDS, check as checkDecision, rubricText } from "./classify.mjs";
import { PRESETS, SHIMMED, checkCommand, checkTool, load as loadPermissions, writeCodexRules, writeShims } from "./permissions.mjs";
import { HARNESS_COMMANDS, allHarnessLedgers, loadHarness, presentOpen, presentReport, runHarness } from "./harness.mjs";
import { pin } from "./review-context.mjs";
import { DEPTHS, HOSTS, loadUserConfig, pickTiebreak, pickVerifier } from "./review-plan.mjs";
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
    .addOption(new Option("--depth <depth>", "review depth (default: repo, then user config, then suggested from the diff)").choices(DEPTHS))
    .addOption(new Option("--host <host>", "host that runs the reviewers, for the model plan (default: detected)").choices(HOSTS))
    .action((o) => print(pin(o)));

  const plan = program.command("plan").description("The model plan that pin writes: which model and thinking level each review role gets.");
  const planOf = (dir) => {
    const context = JSON.parse(readFileSync(`${dir}/context.json`, "utf8"));
    if (!context.plan) throw new ledger.LedgerError(`${dir}/context.json has no plan; pin it again with this version`);
    return context.plan;
  };
  plan
    .command("show")
    .description("Print the plan for a pinned change.")
    .requiredOption("--context <dir>", "directory written by pin")
    .action((o) => print(planOf(o.context)));
  plan
    .command("verifier")
    .description("Pick the verifier for one finding: the plan's verifier tier, from another family than the finding's author.")
    .requiredOption("--context <dir>", "directory written by pin")
    .requiredOption("--author <provider/model>", "model that wrote the finding")
    .action((o) => print(pickVerifier(planOf(o.context), o.author, loadUserConfig().config)));
  plan
    .command("tiebreak")
    .description("Pick a tie-break model from a family no earlier model on the finding used.")
    .requiredOption("--context <dir>", "directory written by pin")
    .requiredOption("--exclude <m1,m2>", "models that already judged the finding")
    .action((o) => print(pickTiebreak(planOf(o.context), list(o.exclude), loadUserConfig().config)));
  plan
    .command("config")
    .description("Print the user config path and its checked contents.")
    .action(() => print(loadUserConfig()));

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
  // Every change runs under the ledger's lock, so parallel agents cannot
  // overwrite each other's writes.
  const withLedger = (fn) => (o) => print(ledger.update(o.repo, o.key, (l) => fn(l, o)));

  keyed("path", "Print the ledger file path.").action((o) => print(ledger.ledgerPath(o.repo, o.key)));
  keyed("start", "Start a review round.")
    .requiredOption("--base <sha>", "merge base")
    .requiredOption("--head <sha>", "reviewed head")
    .option("--lenses <a,b>", "lenses chosen for this round")
    .option("--models <m1,m2>", "models planned for this round")
    .option("--past-cap", `start a round past ${ledger.MAX_ROUNDS}, only when a person asks for it`)
    .addOption(new Option("--depth <depth>", "review depth, from context.json").choices(DEPTHS))
    .action(
      withLedger((l, o) => ({
        round: ledger.startRound(l, {
          base: o.base,
          head: o.head,
          lenses: list(o.lenses),
          models: list(o.models),
          pastCap: o.pastCap === true,
          depth: o.depth ?? null,
        }),
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
    .requiredOption("--id <id>", "finding ID")
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
    .option("--keep <F9,F10>", "new findings that look like earlier ones but are different bugs")
    .action(
      withLedger((l, o) =>
        ledger.report(l, Number(o.threshold), { allowMissing: o.allowMissing === true, keep: list(o.keep) }),
      ),
    );
  keyed("dispose", "Record what a person decided about a finding.")
    .requiredOption("--id <F1>", "finding ID")
    .requiredOption("--as <disposition>", "fixed, accepted (will fix), wrong, intended, or not-worth-it")
    .option("--note <text>", "why")
    .option("--note-file <file>", "read the note from a file, or - for stdin; use it for any text copied from GitHub")
    .action(async (o) => {
      if (o.note != null && o.noteFile != null) throw new ledger.LedgerError("use --note or --note-file, not both");
      const note = o.noteFile != null ? (o.noteFile === "-" ? await readStdin() : readFileSync(o.noteFile, "utf8")).trim() : o.note;
      withLedger((l) => {
        ledger.dispose(l, o.id, o.as, note);
        return { id: o.id, disposition: o.as };
      })(o);
    });
  keyed("link", "Record the GitHub review thread that carries a finding.")
    .requiredOption("--id <id>", "finding ID (internal; never posted)")
    .requiredOption("--thread <threadId>", "review thread node ID, from threads list")
    .option("--url <url>", "comment URL")
    .action(withLedger((l, o) => ({ id: o.id, thread: ledger.link(l, o.id, { thread: o.thread, url: o.url }) })));
  keyed("open", "List findings reported in any round and not yet closed.").action((o) =>
    print(
      ledger.openFindings(ledger.load(o.repo, o.key)).map((f) => ({
        id: f.id,
        round: f.round,
        file: f.file,
        line: f.line,
        title: f.title,
        scenario: f.scenario,
        thread: f.thread ?? null,
      })),
    ),
  );
  keyed("last-head", "Print the head reviewed in the last round.").action((o) => print(ledger.load(o.repo, o.key).rounds.at(-1)?.head ?? ""));
  led
    .command("summary")
    .description("Summarize dispositions, noise, rounds and repeated bug classes for one ledger, one repo, or every ledger.")
    .option("--repo <owner/repo>", "repository")
    .option("--key <pr|branch>", "PR number or branch name (needs --repo)")
    .action((o) => {
      if (o.key && !o.repo) throw new ledger.LedgerError("--key needs --repo");
      // v1 ledgers and harness reviews both count. A change reviewed under
      // both counts once in each.
      const harness = allHarnessLedgers();
      const ledgers = [...ledger.allLedgers(), ...harness.ledgers].filter(
        (l) => l.rounds.length && (!o.repo || l.repo === o.repo) && (!o.key || l.key === String(o.key)),
      );
      const unreadable = harness.unreadable.filter((u) => (!o.repo || u.repo === o.repo) && (!o.key || u.key === String(o.key)));
      print({ ...ledger.summarize(ledgers), ...(unreadable.length ? { unreadable } : {}) });
    });

  const fnd = program
    .command("findings")
    .description("A harness review's findings, arranged for a person: the report, the open findings, and the last reviewed head.");
  const keyedFindings = (name, description) =>
    fnd
      .command(name)
      .description(description)
      .requiredOption("--repo <owner/repo>", "repository")
      .requiredOption("--key <pr|branch>", "PR number or branch name");
  keyedFindings("report", "The latest round's report: sections, numbers, every place each finding covers, the verdict, and what waits on a person.").action((o) => {
    const { state, ledger: view } = loadHarness(o.repo, o.key);
    print(presentReport(state, view));
  });
  keyedFindings("open", "Findings reported in any round and not yet closed, with their review threads.").action((o) => print(presentOpen(loadHarness(o.repo, o.key).ledger)));
  keyedFindings("last-head", "The head the latest round reviewed.").action((o) => print(loadHarness(o.repo, o.key).ledger.rounds.at(-1)?.head ?? ""));

  // Listed for --help. run() hands these to the harness before commander
  // parses anything, so the harness sees its arguments unchanged.
  for (const [name, description] of Object.entries(HARNESS_COMMANDS)) program.command(name).description(description);

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
    .description(`Write PATH shims for Tau (${SHIMMED.join(", ")}) that call the guard.`)
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
    .option("--github", "also check text bound for GitHub: finding IDs, code outside backticks, broken Markdown")
    .action(async (files, o) => {
      const inputs = files.length ? files.map((f) => [f, readFileSync(f, "utf8")]) : [["<stdin>", await readStdin()]];
      const run = o.github ? checkGithub : checkProse;
      const all = inputs.flatMap(([file, text]) => run(text).map((f) => ({ file, ...f })));
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
  if (Object.hasOwn(HARNESS_COMMANDS, argv[2] ?? "")) return runHarness(argv.slice(2));
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
