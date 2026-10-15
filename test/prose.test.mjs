import { test } from "node:test";
import assert from "node:assert/strict";
import { check } from "../cli/src/check-prose.mjs";

const rules = (text) => check(text).map((f) => f.rule);

test("flags a seeded bad sample", () => {
  const bad = [
    "## Why This Change Matters So Much",
    "",
    "This is a pivotal update \u2014 it will seamlessly foster growth \ud83d\ude80.",
    "Pages 1\u20133 are new. It serves as a testament to the team -- truly.",
    "In order to delve deeper, it is important to note the landscape.",
    "I hope this helps!",
  ].join("\n");
  const found = rules(bad);
  for (const expected of [
    "title-case heading",
    "em dash",
    "en dash",
    "emoji",
    "double hyphen",
    'phrase "pivotal"',
    'phrase "seamlessly"',
    'phrase "foster"',
    'phrase "serves as"',
    'phrase "testament"',
    'phrase "in order to"',
    'phrase "delve"',
    'phrase "it is important to note"',
    'phrase "landscape"',
    'phrase "i hope this helps"',
  ]) {
    assert.ok(found.includes(expected), `expected ${expected}; got ${found.join(", ")}`);
  }
});

test("passes a clean sample", () => {
  const clean = [
    "## Why this change matters",
    "",
    "**Verdict:** Needs changes. F1 drops the first page.",
    "",
    "- **F1** `src/paginate.js:3` Pagination skips the first page. `paginate(items, 1, 2)` returns items 3 and 4.",
    "",
    "Run `npm test -- --watch` to rerun. See https://example.com/a--b for details.",
    "",
    "| Column | Value |",
    "|--------|-------|",
    "",
    "## Install the GitHub CLI",
    "",
    "Use the --draft flag when you open the PR.",
  ].join("\n");
  assert.deepEqual(check(clean), []);
});

test("code blocks and block quotes are exempt", () => {
  const text = ["```sh", "echo \u2014 in order to", "```", "", "> She wrote: a pivotal moment \u2014 really.", "", "Plain line."].join("\n");
  assert.deepEqual(check(text), []);
});

test("words inside other words do not match", () => {
  assert.deepEqual(check("The underscored_name and showcaseItem are identifiers. Fostering is flagged."), [
    { line: 1, rule: 'phrase "fostering"', excerpt: "The underscored_name and showcaseItem are identifiers. Fostering is flagged." },
  ]);
});
