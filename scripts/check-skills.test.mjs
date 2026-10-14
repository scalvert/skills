import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkName, checkSkills } from "./check-skills.mjs";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "check-skills-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const skill = (name) => `---\nname: ${name}\ndescription: Does one thing.\n---\n\n# ${name}\n`;

test("accepts kebab-case names", () => {
  for (const name of ["code-review", "write-clearly", "a1", "x"]) {
    assert.equal(checkName(name), null, name);
  }
});

test("rejects colons, slashes, periods, capitals and doubled hyphens", () => {
  for (const name of ["pact:review", "pact/review", "pact.review", "Review", "review--pr", "-review", "review-"]) {
    assert.match(checkName(name), /not kebab-case/, name);
  }
});

test("passes a flat plugin layout", () => {
  const root = fixture({ "acme/skills/write-clearly/SKILL.md": skill("write-clearly") });
  assert.deepEqual(checkSkills(root).problems, []);
});

test("fails a bad name", () => {
  const root = fixture({ "acme/skills/bad:name/SKILL.md": skill("bad:name") });
  const { problems } = checkSkills(root);
  assert.ok(problems.some((p) => p.includes("not kebab-case")), problems.join("\n"));
});

test("fails a name that does not match its folder", () => {
  const root = fixture({ "acme/skills/review/SKILL.md": skill("code-review") });
  assert.ok(checkSkills(root).problems.some((p) => p.includes("does not match folder")));
});

test("fails a skill nested inside another skill or a category folder", () => {
  const root = fixture({
    "acme/skills/review/SKILL.md": skill("review"),
    "acme/skills/review/deep/SKILL.md": skill("deep"),
    "acme/skills/code/lint/SKILL.md": skill("lint"),
  });
  const nested = checkSkills(root).problems.filter((p) => p.includes("nested or misplaced"));
  assert.equal(nested.length, 2, nested.join("\n"));
});

test("fails a missing description", () => {
  const root = fixture({ "acme/skills/x/SKILL.md": "---\nname: x\n---\n" });
  assert.ok(checkSkills(root).problems.some((p) => p.includes("missing description")));
});
