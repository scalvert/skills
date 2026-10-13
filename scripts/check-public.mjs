#!/usr/bin/env node
// Fails if a tracked file contains a reference that belongs in a private repo:
// internal codenames, internal hosts, internal Jira keys or Slack channel IDs.
// This repo is public, so these never belong here.
//
// Usage: node scripts/check-public.mjs [file ...]   (default: git ls-files)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DENY = [
  { label: "internal codename", pattern: /\b(ask)?scio\b/i },
  { label: "internal host", pattern: /\b(glean\.slack\.com|askscio\.atlassian\.net|scio-engineering|app\.glean\.com)\b/i },
  { label: "internal Jira key", pattern: /\b(DEVPLAT|PACT|SCIO)-\d+\b/ },
  { label: "Slack channel ID", pattern: /\b[CG]0[A-Z0-9]{8,10}\b/ },
];

// Files that must name the patterns in order to check for them.
const SELF = new Set(["scripts/check-public.mjs", "scripts/check-public.test.mjs"]);

export function scan(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const { label, pattern } of DENY) {
      const m = line.match(pattern);
      if (m) hits.push({ line: i + 1, label, match: m[0] });
    }
  });
  return hits;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.length > 2
    ? process.argv.slice(2)
    : execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  let failed = false;
  for (const file of files) {
    if (SELF.has(file) || file === "package-lock.json") continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const hit of scan(text)) {
      failed = true;
      console.error(`check-public: ${file}:${hit.line}: ${hit.label} "${hit.match}"`);
    }
  }
  if (failed) process.exit(1);
  console.log(`check-public: ${files.length} files OK`);
}
