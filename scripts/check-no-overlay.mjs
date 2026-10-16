#!/usr/bin/env node
// Checks that the built plugin works for someone who is not its author:
//
// 1. No personal markers. The kit ships defaults for anyone; the author's own
//    preferences live in a personal overlay (global AGENTS.md / CLAUDE.md),
//    never in the skills.
// 2. Safe by default. Every skill that can post, merge or push routes those
//    actions through the repo permission check, so a repo with no rules gets
//    the draft-pr preset rather than whatever the agent decides.
//
// Usage: node scripts/check-no-overlay.mjs [plugin dir]   (default: plugins/claude/scalvert)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] ?? "plugins/claude/scalvert";

const PERSONAL = [
  /\bsteve\b/i,
  /stevecalvert/i,
  /\/Users\//,
  /@gmail\.com/i,
  /steve-calvert-glean/,
  /tastemaker/i,
  /gh auth switch/,
];

// Skills that act outside the machine, and so must carry the check.
const WRITERS = ["code-review", "self-review", "address-review-comments"];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const problems = [];
for (const file of walk(root)) {
  if (!/\.(md|mjs|json)$/.test(file)) continue;
  // Manifests name the author on purpose.
  if (/\.(claude|codex)-plugin\//.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const pattern of PERSONAL) {
    const m = text.match(pattern);
    if (m) problems.push(`${relative(root, file)}: personal marker "${m[0]}"`);
  }
}

for (const skill of WRITERS) {
  const text = readFileSync(join(root, "skills", skill, "SKILL.md"), "utf8");
  if (!text.includes("scripts/agent-review.mjs policy check")) {
    problems.push(`skills/${skill}/SKILL.md: can act outside the machine but never runs the permission check`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(`check-no-overlay: ${p}`);
  process.exit(1);
}
console.log(`check-no-overlay: ${root} OK`);
