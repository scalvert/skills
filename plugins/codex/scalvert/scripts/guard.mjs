#!/usr/bin/env node
// PreToolUse guard for cases host permission rules cannot express.
//
// Claude Code enforces the repo's permission rules natively, so on Claude this
// guard only covers:
//   - git push that lands on the default branch without naming it (a bare
//     "git push" while on main, "git push origin HEAD", or a default branch
//     other than main or master)
//   - gh api calls that write (a GraphQL mutation, a non-GET method, or
//     fields on a REST call, which make gh send a POST)
// On Codex, prefix rules compiled into .codex/rules cover most commands. Codex
// rules cannot express a wildcard in the middle of a pattern or an MCP tool,
// so the guard also applies those repo rules there. A Codex PreToolUse hook
// can deny but cannot ask, so "ask" becomes a deny that tells the agent to
// get the user's approval.
//
// Tau has no hook for this yet, so the PATH shims from "permissions.mjs shim"
// call the guard with the command line instead, and it applies every repo
// rule. It exits 126 with a reason when the command needs approval.
//
// Usage:
//   guard.mjs --host claude|codex      (reads the hook event JSON on stdin)
//   guard.mjs --host tau -- <argv...>

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkCommand, checkTool, load, normalize, splitCommand } from "./permissions.mjs";

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function repoState(cwd) {
  // symbolic-ref also works on a branch with no commits yet.
  const branch = git(cwd, ["symbolic-ref", "--short", "HEAD"]) ?? git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = git(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  const defaultBranch = head ? head.replace(/^origin\//, "") : null;
  return { branch, defaultBranch, root: git(cwd, ["rev-parse", "--show-toplevel"]) };
}

const PUSH_FLAGS_WITH_VALUE = new Set(["--repo", "--receive-pack", "--exec", "-o", "--push-option", "--signed"]);

// Returns a reason when a git push would update the default branch.
export function defaultBranchPush(sub, { branch, defaultBranch }) {
  const words = sub.split(" ");
  if (words[0] !== "git" || words[1] !== "push") return null;
  const protectedBranches = new Set([defaultBranch ?? "main", "main", "master"]);
  const positional = [];
  for (let i = 2; i < words.length; i++) {
    const w = words[i];
    if (PUSH_FLAGS_WITH_VALUE.has(w)) i++;
    else if (!w.startsWith("-")) positional.push(w);
  }
  const refspecs = positional.slice(1);
  if (refspecs.length === 0 || refspecs.includes("HEAD")) {
    return branch && protectedBranches.has(branch) ? `pushes the current branch, ${branch}, which is the default branch` : null;
  }
  for (const spec of refspecs) {
    const dst = spec.replace(/^\+/, "").split(":").pop().replace(/^refs\/heads\//, "");
    if (protectedBranches.has(dst)) return `pushes to ${dst}, the default branch`;
  }
  return null;
}

// Returns a reason when a gh api call writes.
export function ghApiWrite(sub) {
  const words = sub.split(" ");
  if (words[0] !== "gh" || words[1] !== "api") return null;
  const text = words.slice(2).join(" ");
  const method = text.match(/(?:^|\s)(?:-X|--method)[ =]?([A-Za-z]+)/);
  if (method) return method[1].toUpperCase() === "GET" ? null : `gh api with method ${method[1].toUpperCase()}`;
  if (words[2] === "graphql") return /\bmutation\b/.test(text) ? "a GraphQL mutation" : null;
  if (/(?:^|\s)(-f|-F|--field|--raw-field|--input)(\s|=|$)/.test(text)) return "gh api with fields, which sends a POST";
  return null;
}

function isPrefixTranslatable(rule) {
  const m = rule.match(/^Bash\((.*)\)$/s);
  if (!m) return false;
  const p = m[1].endsWith(":*") ? `${m[1].slice(0, -2)} *` : m[1];
  const stars = (p.match(/\*/g) ?? []).length;
  return stars === 0 || (stars === 1 && p.endsWith(" *"));
}

export function evaluate(event, { host, state, permissions }) {
  const tool = event.tool_name ?? "";
  if (tool === "Bash" || tool === "shell" || tool === "exec_command") {
    const command = event.tool_input?.command ?? event.tool_input?.cmd ?? "";
    const text = Array.isArray(command) ? command.join(" ") : String(command);
    for (const raw of splitCommand(text)) {
      const sub = normalize(raw, { forAllow: false });
      const reason = defaultBranchPush(sub, state) ?? ghApiWrite(sub);
      if (reason) return { decision: "ask", reason: `"${sub}" ${reason}` };
    }
    if (host === "codex") {
      const result = checkCommand(permissions, text);
      if (result.decision !== "allow" && result.rule && !isPrefixTranslatable(result.rule)) {
        return { decision: result.decision, reason: `"${result.subcommand}" matches the repo rule ${result.rule}` };
      }
    }
    return null;
  }
  if (host === "codex" && tool.startsWith("mcp__")) {
    const result = checkTool(permissions, tool);
    if (result.decision !== "allow" && result.rule) {
      return { decision: result.decision, reason: `${tool} matches the repo rule ${result.rule}` };
    }
  }
  return null;
}

export function render(verdict, host) {
  if (!verdict) return null;
  const why = `scalvert guard: ${verdict.reason}.`;
  if (host === "claude") {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: verdict.decision,
        permissionDecisionReason: why,
      },
    };
  }
  const tail = verdict.decision === "ask"
    ? " This needs the user's explicit approval. Ask the user, and if they approve, ask them to run it or approve it themselves."
    : " The repo rules deny this.";
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: why + tail,
    },
  };
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

export function tauCheck(argv, { state, permissions }) {
  const text = argv.join(" ");
  const sub = normalize(text, { forAllow: false });
  const reason = defaultBranchPush(sub, state) ?? ghApiWrite(sub);
  if (reason) return { decision: "ask", reason: `"${sub}" ${reason}` };
  const result = checkCommand(permissions, text);
  // Unmatched commands are left alone; the shim only enforces explicit rules.
  if (result.decision !== "allow" && result.rule) {
    return { decision: result.decision, reason: `"${result.subcommand}" matches the repo rule ${result.rule}` };
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.argv.includes("--host") ? process.argv[process.argv.indexOf("--host") + 1] : "claude";
  if (host === "tau") {
    const argv = process.argv.slice(process.argv.indexOf("--") + 1);
    const state = repoState(process.cwd());
    const settings = state.root ? join(state.root, ".claude", "settings.json") : undefined;
    const verdict = tauCheck(argv, { state, permissions: load(settings).permissions });
    if (verdict) {
      const what = verdict.decision === "deny" ? "The repo rules deny this." : "This needs the user's explicit approval in this conversation. After the user approves, rerun with SCALVERT_APPROVED=1.";
      process.stderr.write(`scalvert: blocked. ${verdict.reason}. ${what}\n`);
      process.exit(126);
    }
    process.exit(0);
  }
  try {
    const event = JSON.parse(await readStdin());
    const cwd = event.cwd ?? process.cwd();
    const state = repoState(cwd);
    const settings = state.root ? join(state.root, ".claude", "settings.json") : undefined;
    const { permissions } = load(settings);
    const out = render(evaluate(event, { host, state, permissions }), host);
    if (out) process.stdout.write(JSON.stringify(out));
    process.exit(0);
  } catch (err) {
    // Fail closed on Codex, where this hook is the only check for some
    // actions; on Claude the native rules still apply, so fail open.
    if (host === "codex") {
      process.stderr.write(`scalvert guard failed: ${err.message}\n`);
      process.exit(2);
    }
    process.exit(0);
  }
}
