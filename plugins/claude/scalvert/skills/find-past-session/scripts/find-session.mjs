#!/usr/bin/env node
// Finds past agent sessions on this machine by what the user typed in them.
//
// Reads the session files that Claude Code, Codex and Cursor keep under the
// home folder, and Claude Code's prompt history, which outlives its
// transcripts. It reads files only: it never sends them anywhere and never
// changes them.
//
// Usage: node find-session.mjs <words...> [--days n] [--repo text] [--any]
//                                         [--limit n] [--json] [--home dir]

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import * as zlib from "node:zlib";

/** Prompts that start like this were written by a tool, not typed by a person. */
const INJECTED = /^(<[a-z_-]+[ >]|Caveat: The messages below|\[Request interrupted|# AGENTS\.md)/i;

/**
 * Quotes a word for a POSIX shell, so a path with spaces or `$(...)` stays one
 * literal argument. Plain words are left as they are, to keep the command easy
 * to read.
 *
 * @param {string} word
 * @returns {string}
 */
function shellQuote(word) {
  return /^[\w./:@%+=,-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

/**
 * Lists the files under a folder whose name passes a test.
 *
 * @param {string} dir Folder to walk.
 * @param {(name: string) => boolean} keep Test for a file name.
 * @returns {string[]} Absolute paths. Empty when the folder does not exist.
 */
function walk(dir, keep) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(path, keep));
    else if (keep(entry.name)) found.push(path);
  }
  return found;
}

/**
 * Reads a JSON Lines file, decompressing it when Codex has archived it.
 *
 * @param {string} file Path to a `.jsonl` or `.jsonl.zst` file.
 * @returns {object[] | null} The parsed lines, or null when the file is
 *   compressed and this machine cannot decompress it.
 */
function readLines(file) {
  let text;
  if (file.endsWith(".zst")) {
    try {
      text = zlib.zstdDecompressSync
        ? zlib.zstdDecompressSync(readFileSync(file)).toString("utf8")
        : execFileSync("zstd", ["-dc", file], { encoding: "utf8", maxBuffer: 1 << 30 });
    } catch {
      return null;
    }
  } else {
    text = readFileSync(file, "utf8");
  }
  const lines = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      lines.push(JSON.parse(line));
    } catch {
      // A session that is still being written can end in a partial line.
    }
  }
  return lines;
}

/**
 * Returns the text a message carries, whether its content is a string or a
 * list of blocks.
 *
 * @param {unknown} content The `content` field of a message.
 * @returns {string[]} One entry per text block.
 */
function textsOf(content) {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block && (block.type === "text" || block.type === "input_text") && typeof block.text === "string")
    .map((block) => block.text);
}

/**
 * @typedef {object} Session
 * @property {string} tool Which tool wrote the session.
 * @property {string} id Session ID, when the tool records one.
 * @property {string} cwd Folder the session ran in.
 * @property {number} time Start time in milliseconds.
 * @property {string} file The file the prompts came from.
 * @property {string[]} prompts What the user typed.
 * @property {string} [reopen] Command that reopens the session.
 */

/** @returns {Session[]} */
function claudeSessions(home) {
  const sessions = [];
  const root = join(home, ".claude", "projects");
  for (const file of walk(root, (name) => name.endsWith(".jsonl"))) {
    if (file.includes("/subagents/")) continue;
    const session = { tool: "claude-code", id: basename(file, ".jsonl"), cwd: "", time: 0, file, prompts: [] };
    for (const line of readLines(file) ?? []) {
      if (line.cwd && !session.cwd) session.cwd = line.cwd;
      if (line.timestamp && !session.time) session.time = Date.parse(line.timestamp);
      // A user line with toolUseResult carries a tool's output, not a prompt.
      // A compact summary is Claude Code's recap of the whole session.
      if (line.type !== "user" || line.isSidechain || line.isMeta || line.toolUseResult || line.isCompactSummary) continue;
      session.prompts.push(...textsOf(line.message?.content));
    }
    const resume = `claude --resume ${shellQuote(session.id)}`;
    session.reopen = session.cwd ? `cd ${shellQuote(session.cwd)} && ${resume}` : resume;
    sessions.push(session);
  }
  return sessions;
}

/** @returns {Session[]} One entry per prompt in Claude Code's prompt history. */
function claudeHistory(home) {
  const file = join(home, ".claude", "history.jsonl");
  if (!existsSync(file)) return [];
  return (readLines(file) ?? [])
    .filter((line) => typeof line.display === "string" && !line.display.startsWith("/"))
    .map((line) => ({
      tool: "claude-code history",
      id: line.sessionId ?? "",
      cwd: line.project ?? "",
      time: Number(line.timestamp) || 0,
      file,
      prompts: [line.display],
    }));
}

/** @returns {{ sessions: Session[], unreadable: number }} */
function codexSessions(home) {
  const sessions = [];
  let unreadable = 0;
  const isSession = (name) => name.endsWith(".jsonl") || name.endsWith(".jsonl.zst");
  const files = ["sessions", "archived_sessions"].flatMap((dir) => walk(join(home, ".codex", dir), isSession));
  for (const file of files) {
    const lines = readLines(file);
    if (!lines) {
      unreadable += 1;
      continue;
    }
    const session = { tool: "codex", id: "", cwd: "", time: 0, file, prompts: [] };
    let subagent = false;
    for (const line of lines) {
      const payload = line.payload ?? {};
      if (line.type === "session_meta") {
        session.id = payload.id ?? "";
        session.cwd = payload.cwd ?? "";
        session.time = Date.parse(payload.timestamp ?? line.timestamp ?? "") || 0;
        subagent = Boolean(payload.source && typeof payload.source === "object" && payload.source.subagent);
      } else if (line.type === "response_item" && payload.type === "message" && payload.role === "user") {
        session.prompts.push(...textsOf(payload.content));
      }
    }
    if (subagent) continue;
    if (session.id) session.reopen = `codex resume ${session.id}`;
    sessions.push(session);
  }
  return { sessions, unreadable };
}

/** @returns {Session[]} */
function cursorSessions(home) {
  const sessions = [];
  const root = join(home, ".cursor", "projects");
  for (const file of walk(root, (name) => name.endsWith(".jsonl"))) {
    if (!file.includes("/agent-transcripts/")) continue;
    // Cursor names the project folder after the path, with dashes for slashes.
    const project = file.slice(root.length + 1).split("/")[0];
    const session = { tool: "cursor", id: basename(file, ".jsonl"), cwd: project, time: statSync(file).mtimeMs, file, prompts: [] };
    for (const line of readLines(file) ?? []) {
      if (line.role !== "user") continue;
      for (const text of textsOf(line.message?.content)) {
        const query = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
        session.prompts.push(query ? query[1] : text);
      }
    }
    sessions.push(session);
  }
  return sessions;
}

/**
 * Searches every session under a home folder.
 *
 * @param {object} options
 * @param {string[]} options.terms Words or phrases to look for.
 * @param {string} [options.home] Home folder to search. Defaults to the user's.
 * @param {boolean} [options.any] Match a prompt with any term, not all of them.
 * @param {number} [options.days] Only sessions newer than this many days.
 * @param {string} [options.repo] Only sessions whose folder contains this text.
 * @param {number} [options.limit] Most results to return.
 * @param {number} [options.now] Current time in milliseconds, for tests.
 * @returns {{ matches: object[], coverage: object }}
 */
export function findSessions({ terms, home = homedir(), any = false, days, repo, limit = 20, now = Date.now() }) {
  const codex = codexSessions(home);
  const groups = {
    "claude-code": claudeSessions(home),
    "claude-code history": claudeHistory(home),
    codex: codex.sessions,
    cursor: cursorSessions(home),
  };
  const coverage = Object.fromEntries(
    Object.entries(groups).map(([tool, list]) => [
      tool,
      { sessions: list.length, prompts: list.reduce((count, session) => count + session.prompts.length, 0) },
    ]),
  );
  coverage.codex.unreadable = codex.unreadable;

  const wanted = terms.map((term) => term.toLowerCase());
  const since = days ? now - days * 86_400_000 : 0;
  const matches = [];
  // The history repeats prompts whose transcript still exists. Index every
  // transcript before any filter, so a history entry is dropped even when its
  // transcript is too old to list or matched on an earlier prompt.
  const transcriptIds = new Set();
  const transcriptPrompts = new Set();
  const promptKey = (cwd, text) => `${cwd}\n${text.slice(0, 200)}`;
  for (const session of groups["claude-code"]) {
    transcriptIds.add(session.id);
    for (const prompt of session.prompts) transcriptPrompts.add(promptKey(session.cwd, prompt.trim()));
  }

  for (const session of Object.values(groups).flat()) {
    if (session.time < since) continue;
    if (repo && !session.cwd.toLowerCase().includes(repo.toLowerCase())) continue;
    for (const prompt of session.prompts) {
      const text = prompt.trim();
      if (!text || INJECTED.test(text)) continue;
      const lower = text.toLowerCase();
      const hit = any ? wanted.some((term) => lower.includes(term)) : wanted.every((term) => lower.includes(term));
      if (!hit) continue;
      if (session.tool === "claude-code history") {
        if (transcriptIds.has(session.id) || transcriptPrompts.has(promptKey(session.cwd, text))) continue;
      }
      const at = Math.max(0, lower.indexOf(wanted.find((term) => lower.includes(term))) - 80);
      matches.push({
        tool: session.tool,
        date: session.time ? new Date(session.time).toISOString().slice(0, 10) : "unknown",
        time: session.time,
        cwd: session.cwd,
        id: session.id,
        line: text.slice(at, at + 240).replace(/\s+/g, " "),
        file: session.file,
        reopen: session.reopen ?? null,
      });
      break;
    }
  }

  matches.sort((a, b) => b.time - a.time);
  return { matches: matches.slice(0, limit), total: matches.length, coverage };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      days: { type: "string" },
      repo: { type: "string" },
      limit: { type: "string", default: "20" },
      home: { type: "string" },
      any: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
  if (positionals.length === 0) {
    console.error("usage: find-session.mjs <words...> [--days n] [--repo text] [--any] [--limit n] [--json]");
    process.exit(2);
  }
  const result = findSessions({
    terms: positionals,
    home: values.home,
    any: values.any,
    days: values.days ? Number(values.days) : undefined,
    repo: values.repo,
    limit: Number(values.limit),
  });
  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const match of result.matches) {
      console.log(`${match.date}  ${match.tool}  ${match.cwd || "(no folder)"}`);
      console.log(`  ${match.line}`);
      console.log(`  ${match.reopen ?? match.file}`);
      console.log();
    }
    console.log(`${result.matches.length} of ${result.total} matching sessions shown.`);
    const parts = Object.entries(result.coverage).map(([tool, c]) => {
      // Each history entry is one prompt, so a session count would repeat it.
      if (tool === "claude-code history") return `${tool}: ${c.prompts} prompts`;
      const unreadable = c.unreadable ? `, ${c.unreadable} unreadable` : "";
      return `${tool}: ${c.sessions} sessions, ${c.prompts} prompts${unreadable}`;
    });
    console.log(`Searched ${parts.join("; ")}.`);
  }
}
