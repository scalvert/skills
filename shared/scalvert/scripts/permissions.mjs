#!/usr/bin/env node
// Repo permission rules for the scalvert skills.
//
// Rules use Claude Code's permission syntax ({ allow, ask, deny } lists of
// "Tool" or "Tool(pattern)" strings) and live in the repo's
// .claude/settings.json. There is no cross-agent standard for permission
// files yet, so the kit uses the most widely copied format and adds no keys.
//
// The resolver answers one question for a skill that is about to act:
// "would this command or tool call be allowed, need approval, or be denied
// here?" It follows Claude Code's documented matching:
//   - rules are checked deny, then ask, then allow; the first match wins
//   - compound commands are split on && || ; | |& & and newlines; a deny or
//     ask rule applies when any subcommand matches, and an allow rule must
//     match every subcommand
//   - the wrappers timeout, time, nice, nohup, stdbuf, command, builtin,
//     noglob and bare xargs are stripped before matching
//   - "*" matches any text; a trailing " *" (or ":*") also matches the bare
//     command
// A command no rule matches resolves to "ask", which is what Claude Code
// does for a command that is not read-only.
//
// Usage:
//   permissions.mjs preset <local-only|draft-pr|self-merge>
//   permissions.mjs check [--settings <file>] [--json] -- <command...>
//   permissions.mjs check [--settings <file>] [--json] --tool <tool-name>
//   permissions.mjs lint [--settings <file>]
//   permissions.mjs compile [--settings <file>] --codex <out.rules>
//   permissions.mjs shim <dir>
// A repo with no .claude/settings.json, or one with no permissions block,
// gets the draft-pr preset.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// External actions every preset gates. Pushes to the default branch by name
// are listed here; a bare "git push" while on the default branch needs the
// PreToolUse hook, because a rule cannot see the current branch.
const GATED = [
  "Bash(gh pr comment *)",
  "Bash(gh pr review *)",
  "Bash(gh pr close *)",
  "Bash(gh issue create *)",
  "Bash(gh issue comment *)",
  "Bash(gh issue close *)",
  "Bash(gh release *)",
  "Bash(npm publish *)",
  "Bash(pnpm publish *)",
  "Bash(yarn npm publish *)",
  "Bash(git push -f *)",
  "Bash(git push * -f)",
  "Bash(git push * -f *)",
  "Bash(git push *--force*)",
  "Bash(git push * main)",
  "Bash(git push * master)",
  "Bash(git push *:main)",
  "Bash(git push *:master)",
  "mcp__*github*__create_*",
  "mcp__*github*__add_*",
  "mcp__*github*__update_*",
  "mcp__*github*__merge_*",
  "mcp__*github*__submit_*",
  "mcp__*github*__delete_*",
  "mcp__*github*__push_*",
  "mcp__*slack*__*post*",
  "mcp__*slack*__*send*",
];

const MERGE = ["Bash(gh pr merge *)", "Bash(gh pr ready *)"];
// Feature-branch pushes are allowed; force pushes and pushes to main or
// master are in GATED, and ask beats allow.
const DRAFT = ["Bash(git push *)", "Bash(gh pr create --draft *)"];

export const PRESETS = {
  "local-only": { allow: [], ask: [...GATED, ...MERGE, "Bash(git push *)", "Bash(gh pr create *)"], deny: [] },
  "draft-pr": { allow: [...DRAFT], ask: [...GATED, ...MERGE], deny: [] },
  "self-merge": { allow: [...DRAFT, ...MERGE], ask: [...GATED], deny: [] },
};

export const DEFAULT_PRESET = "draft-pr";

const WRAPPERS = new Set(["timeout", "time", "nice", "nohup", "stdbuf", "command", "builtin", "noglob"]);
const SAFE_ENV = new Set(["NODE_ENV", "CI", "FORCE_COLOR", "NO_COLOR", "LANG", "LC_ALL", "TZ"]);

export class PermissionsError extends Error {}

export function validate(permissions) {
  if (permissions === null || typeof permissions !== "object" || Array.isArray(permissions)) {
    throw new PermissionsError("permissions must be an object with allow, ask and deny lists");
  }
  for (const key of ["allow", "ask", "deny"]) {
    const list = permissions[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.some((r) => typeof r !== "string" || r.trim() === "")) {
      throw new PermissionsError(`permissions.${key} must be a list of rule strings`);
    }
    for (const rule of list) parseRule(rule);
  }
  return { allow: permissions.allow ?? [], ask: permissions.ask ?? [], deny: permissions.deny ?? [] };
}

// Loads the repo's rules. Returns { permissions, source }.
export function load(settingsPath) {
  const path = settingsPath ?? join(process.cwd(), ".claude", "settings.json");
  if (!existsSync(path)) {
    return { permissions: PRESETS[DEFAULT_PRESET], source: `preset:${DEFAULT_PRESET} (no ${path})` };
  }
  let settings;
  try {
    settings = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new PermissionsError(`${path}: not valid JSON (${err.message})`);
  }
  if (settings.permissions === undefined) {
    return { permissions: PRESETS[DEFAULT_PRESET], source: `preset:${DEFAULT_PRESET} (no permissions in ${path})` };
  }
  return { permissions: validate(settings.permissions), source: path };
}

function parseRule(rule) {
  const m = rule.match(/^([^()]+?)(?:\((.*)\))?$/s);
  if (!m) throw new PermissionsError(`invalid rule "${rule}"`);
  return { tool: m[1].trim(), pattern: m[2] };
}

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "s");
}

export function matchPattern(pattern, command) {
  let p = pattern.endsWith(":*") ? `${pattern.slice(0, -2)} *` : pattern;
  if (!p.includes("*")) return command === p;
  const stars = (p.match(/\*/g) ?? []).length;
  if (stars === 1 && p.endsWith(" *")) {
    const prefix = p.slice(0, -2);
    return command === prefix || command.startsWith(`${prefix} `);
  }
  return globToRegExp(p).test(command);
}

// Splits a command on shell separators outside quotes, and pulls out the
// bodies of $(...) and `...` so rules see nested commands too.
export function splitCommand(command) {
  const parts = [];
  const nested = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      current += c;
      if (c === "\\" && quote === '"') current += command[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      current += c;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||" || two === "|&") {
      parts.push(current);
      current = "";
      i++;
      continue;
    }
    if (c === ";" || c === "|" || c === "&" || c === "\n") {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  for (const m of command.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) nested.push(...splitCommand(m[1] ?? m[2]));
  return [...parts, ...nested].map((p) => p.trim().replace(/\s+/g, " ")).filter(Boolean)
    .map((p) => p.replace(/^\(+\s*|\s*\)+$/g, ""))
    .filter(Boolean);
}

// Strips wrappers and leading assignments. For allow matching, only known-safe
// assignments are stripped; for ask and deny, any leading assignment is.
export function normalize(sub, { forAllow }) {
  let words = sub.split(" ");
  for (;;) {
    const w = words[0];
    if (w === undefined) break;
    const assign = w.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (assign) {
      if (forAllow && !SAFE_ENV.has(assign[1])) return null;
      words = words.slice(1);
      continue;
    }
    if (WRAPPERS.has(w)) {
      if (w === "command" && words[1] === "-v") break;
      words = words.slice(1);
      // Drop the wrapper's own options and arguments.
      if (w === "timeout") {
        while (words[0]?.startsWith("-")) words = words.slice(1);
        words = words.slice(1);
      } else if (w === "nice") {
        if (words[0] === "-n") words = words.slice(2);
        else if (/^-\d+$/.test(words[0] ?? "")) words = words.slice(1);
      } else if (w === "stdbuf") {
        while (words[0]?.startsWith("-")) words = words.slice(1);
      }
      continue;
    }
    if (w === "xargs" && words[1] && !words[1].startsWith("-")) {
      words = words.slice(1);
      continue;
    }
    break;
  }
  return words.join(" ");
}

function ruleMatchesBash(rule, sub) {
  const { tool, pattern } = parseRule(rule);
  if (tool !== "Bash") return false;
  return pattern === undefined || pattern === "*" || matchPattern(pattern, sub);
}

function ruleMatchesTool(rule, toolName, kind) {
  const { tool, pattern } = parseRule(rule);
  if (pattern !== undefined) return false;
  if (!tool.includes("*")) return tool === toolName;
  // Allow globs need a literal mcp__<server>__ prefix, as in Claude Code.
  if (kind === "allow" && !/^mcp__[^*]+?__/.test(tool)) return false;
  return globToRegExp(tool).test(toolName);
}

export function checkCommand(permissions, command) {
  const subs = splitCommand(command);
  for (const kind of ["deny", "ask"]) {
    for (const sub of subs) {
      const target = normalize(sub, { forAllow: false });
      const rule = permissions[kind].find((r) => ruleMatchesBash(r, target));
      if (rule) return { decision: kind, rule, subcommand: target };
    }
  }
  if (subs.length === 0) return { decision: "ask", rule: null, subcommand: null };
  let lastRule = null;
  for (const sub of subs) {
    const target = normalize(sub, { forAllow: true });
    const rule = target === null ? undefined : permissions.allow.find((r) => ruleMatchesBash(r, target));
    if (!rule) return { decision: "ask", rule: null, subcommand: target ?? sub };
    lastRule = rule;
  }
  return { decision: "allow", rule: lastRule, subcommand: null };
}

export function checkTool(permissions, toolName) {
  for (const kind of ["deny", "ask", "allow"]) {
    const rule = permissions[kind].find((r) => ruleMatchesTool(r, toolName, kind));
    if (rule) return { decision: kind, rule };
  }
  return { decision: "ask", rule: null };
}

// Codex execpolicy only matches command prefixes. A rule with a single
// trailing wildcard becomes a prefix rule. An exact rule becomes a prefix
// rule only for ask and deny, where matching more is the safe direction.
// Everything else (mid-pattern wildcards, MCP tools) is left to guard.mjs.
const CODEX_DECISION = { deny: "forbidden", ask: "prompt", allow: "allow" };

export function toCodexPrefix(rule, kind) {
  const { tool, pattern } = parseRule(rule);
  if (tool !== "Bash" || pattern === undefined) return null;
  const p = pattern.endsWith(":*") ? `${pattern.slice(0, -2)} *` : pattern;
  const stars = (p.match(/\*/g) ?? []).length;
  let prefix;
  if (stars === 0) {
    if (kind === "allow") return null;
    prefix = p;
  } else if (stars === 1 && p.endsWith(" *")) prefix = p.slice(0, -2);
  else return null;
  const tokens = prefix.trim().split(/\s+/);
  return tokens.length && tokens[0] ? tokens : null;
}

export function compileCodex(permissions, source) {
  const lines = [
    "# Generated by scalvert permissions compile. Do not edit.",
    `# Source: ${source}`,
    "# Rules Codex prefix rules cannot express are enforced by the scalvert guard hook.",
    "",
  ];
  const skipped = [];
  for (const kind of ["deny", "ask", "allow"]) {
    for (const rule of permissions[kind]) {
      const tokens = toCodexPrefix(rule, kind);
      if (!tokens) {
        skipped.push(rule);
        continue;
      }
      lines.push(
        `prefix_rule(pattern=${JSON.stringify(tokens)}, decision="${CODEX_DECISION[kind]}", justification=${JSON.stringify(`repo rule ${kind}: ${rule}`)})`,
      );
    }
  }
  return { text: `${lines.join("\n")}\n`, skipped };
}

// Writes gh, git and npm wrappers for Tau. Each one checks the repo rules only
// when PI_SESSION_ID is set (a Tau agent shell) and leaves a person's terminal
// alone. An agent can bypass a PATH shim by using an absolute path, so this is
// a speed bump until Tau's authority layer reads repo rules.
export const SHIMMED = ["gh", "git", "npm", "pnpm", "yarn"];

export function writeShims(dir) {
  const guard = join(dirname(fileURLToPath(import.meta.url)), "guard.mjs");
  const abs = resolve(dir);
  mkdirSync(abs, { recursive: true });
  for (const name of SHIMMED) {
    const body = `#!/bin/sh
# Generated by scalvert permissions shim.
# SCALVERT_IN_SHIM stops the guard's own git calls from re-entering the shim.
if [ -n "$PI_SESSION_ID" ] && [ -z "$SCALVERT_APPROVED" ] && [ -z "$SCALVERT_IN_SHIM" ]; then
  SCALVERT_IN_SHIM=1 node ${JSON.stringify(guard)} --host tau -- ${name} "$@" || exit $?
fi
IFS=:
for d in $PATH; do
  [ "$d" = ${JSON.stringify(abs)} ] && continue
  [ -x "$d/${name}" ] && exec "$d/${name}" "$@"
done
echo "${name}: not found" >&2
exit 127
`;
    const file = join(abs, name);
    writeFileSync(file, body);
    chmodSync(file, 0o755);
  }
  return SHIMMED.map((n) => join(abs, n));
}

function parseArgs(argv) {
  const opts = { json: false, settings: undefined, tool: undefined, codex: undefined, command: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--settings") opts.settings = argv[++i];
    else if (a === "--tool") opts.tool = argv[++i];
    else if (a === "--codex") opts.codex = argv[++i];
    else if (a === "--") {
      opts.command = argv.slice(i + 1);
      break;
    } else opts.command.push(a);
  }
  return opts;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "preset") {
    const preset = PRESETS[rest[0]];
    if (!preset) {
      console.error(`unknown preset "${rest[0]}"; expected ${Object.keys(PRESETS).join(", ")}`);
      return 2;
    }
    console.log(JSON.stringify({ permissions: preset }, null, 2));
    return 0;
  }
  if (cmd === "lint") {
    const { source } = load(parseArgs(rest).settings);
    console.log(`ok: ${source}`);
    return 0;
  }
  if (cmd === "compile") {
    const opts = parseArgs(rest);
    if (!opts.codex) {
      console.error("compile needs --codex <out.rules>");
      return 2;
    }
    const { permissions, source } = load(opts.settings);
    const { text, skipped } = compileCodex(permissions, source);
    mkdirSync(dirname(resolve(opts.codex)), { recursive: true });
    writeFileSync(opts.codex, text);
    console.log(`wrote ${opts.codex}; ${skipped.length} rules left to the guard hook`);
    return 0;
  }
  if (cmd === "shim") {
    if (!rest[0]) {
      console.error("shim needs a directory");
      return 2;
    }
    for (const f of writeShims(rest[0])) console.log(f);
    return 0;
  }
  if (cmd === "check") {
    const opts = parseArgs(rest);
    const { permissions, source } = load(opts.settings);
    let result;
    if (opts.tool) result = checkTool(permissions, opts.tool);
    else if (opts.command.length) result = checkCommand(permissions, opts.command.join(" "));
    else {
      console.error("check needs a command after -- or --tool <name>");
      return 2;
    }
    if (opts.json) console.log(JSON.stringify({ ...result, source }));
    else console.log(result.decision);
    return 0;
  }
  console.error(
    "usage: permissions.mjs preset <name> | check [--settings f] [--json] (-- <command> | --tool <name>) | lint [--settings f] | compile [--settings f] --codex <out> | shim <dir>",
  );
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    if (err instanceof PermissionsError) {
      console.error(`permissions: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }
}
