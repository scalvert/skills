#!/usr/bin/env node
// Checks every authored skill against the naming and layout rules.
//
// Names: lowercase letters, digits and single hyphens (kebab-case), at most 64
// characters, and equal to the skill's folder name. Colons, slashes and periods
// are rejected because Claude Code, Claude.ai marketplace sync or the Copilot
// plugin check refuse them.
//
// Layout: a skill lives at <plugin>/skills/<name>/SKILL.md. Agent Plugins only
// discovers the immediate children of skills/, so a skill nested inside another
// skill or a category folder is never found.
//
// Usage: node scripts/check-skills.mjs <root>   (default root: shared)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

function findSkillFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...findSkillFiles(path));
    else if (entry === "SKILL.md") found.push(path);
  }
  return found;
}

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return fields;
}

export function checkName(name) {
  if (!name) return "missing name";
  if (name.length > MAX_NAME) return `name is longer than ${MAX_NAME} characters`;
  if (!NAME_PATTERN.test(name)) {
    return `name "${name}" is not kebab-case (lowercase letters, digits, single hyphens; no colons, slashes or periods)`;
  }
  return null;
}

export function checkSkills(root) {
  const problems = [];
  const files = findSkillFiles(root);
  if (files.length === 0) problems.push(`${root}: no SKILL.md files found`);

  for (const file of files) {
    const rel = relative(root, file);
    const skillDir = dirname(file);
    const folder = basename(skillDir);
    const parts = relative(root, skillDir).split(sep);

    // Expect <plugin>/skills/<name>.
    if (parts.length !== 3 || parts[1] !== "skills") {
      problems.push(`${rel}: skill must live at <plugin>/skills/<name>/SKILL.md (nested or misplaced skill)`);
    } else {
      const pluginProblem = checkName(parts[0]);
      if (pluginProblem) problems.push(`${rel}: plugin folder ${pluginProblem}`);
    }

    const fields = frontmatter(readFileSync(file, "utf8"));
    if (!fields) {
      problems.push(`${rel}: missing YAML frontmatter`);
      continue;
    }
    const nameProblem = checkName(fields.name);
    if (nameProblem) problems.push(`${rel}: ${nameProblem}`);
    else if (fields.name !== folder) {
      problems.push(`${rel}: name "${fields.name}" does not match folder "${folder}"`);
    }
    if (!fields.description) problems.push(`${rel}: missing description`);
    else if (fields.description.length > MAX_DESCRIPTION) {
      problems.push(`${rel}: description is longer than ${MAX_DESCRIPTION} characters`);
    }
  }
  return { count: files.length, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] ?? "shared";
  const { count, problems } = checkSkills(root);
  if (problems.length) {
    for (const p of problems) console.error(`check-skills: ${p}`);
    process.exit(1);
  }
  console.log(`check-skills: ${count} skills OK`);
}
