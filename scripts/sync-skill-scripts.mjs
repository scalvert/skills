#!/usr/bin/env node
// Copies shared scripts into each skill folder that needs them.
//
// Agent Skills installers such as `npx skills add` copy only a skill's own
// folder, so a skill cannot reach plugin-level scripts. The authored scripts
// live once in shared/scalvert/scripts/; this writes the copies listed in
// shared/scalvert/skill-scripts.json into shared/scalvert/skills/<skill>/scripts/.
// Edit the shared copy, never a skill's copy. `npm run check:fresh` fails when
// a copy is stale.

import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = "shared/scalvert";
const manifest = JSON.parse(readFileSync(join(root, "skill-scripts.json"), "utf8"));

for (const [skill, entries] of Object.entries(manifest)) {
  const skillDir = join(root, "skills", skill);
  if (!existsSync(skillDir)) throw new Error(`skill-scripts.json names a missing skill: ${skill}`);
  const target = join(skillDir, "scripts");
  rmSync(target, { recursive: true, force: true });
  for (const entry of entries) {
    const from = join(root, "scripts", entry);
    if (!existsSync(from)) throw new Error(`${skill}: missing shared script ${entry}`);
    cpSync(from, join(target, entry), { recursive: true });
  }
  console.log(`sync-skill-scripts: ${skill} <- ${entries.join(", ")}`);
}
