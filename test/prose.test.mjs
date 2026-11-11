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

test("flags the Wikipedia AI-writing phrases", () => {
  const bad = [
    "The rich tapestry of meticulous design is why this matters.",
    "Despite these challenges, the project continues to evolve.",
    "Based on available information, you're absolutely right.",
    "I streamlined the section and improved clarity.",
  ].join("\n");
  const found = rules(bad);
  for (const expected of [
    'phrase "tapestry"',
    'phrase "meticulous"',
    'phrase "why this matters"',
    'phrase "despite these challenges"',
    'phrase "continues to evolve"',
    'phrase "based on available information"',
    'phrase "you\'re absolutely right"',
    'phrase "streamlined"',
    'phrase "improved clarity"',
  ]) {
    assert.ok(found.includes(expected), `expected ${expected}; got ${found.join(", ")}`);
  }
});

test("flags patterns that a fixed phrase cannot catch", () => {
  const cases = [
    ["The station was rebuilt in 1990, reflecting its continued relevance.", "trailing -ing clause"],
    ["The cache retries three times, ensuring the job finishes.", "trailing -ing clause"],
    ["The parser plays a crucial role in the pipeline.", "plays a key role"],
    ["It's not a cache, it's a ledger.", "it's not X, it's Y"],
    ["No guessing, no wasted motion.", "no X, no Y"],
    ["It ships today. No meetings, no Slack, just code.", "no X, no Y"],
    ["- No setup, no config", "no X, no Y"],
    ["It ships today.\nNo meetings, no Slack.", "no X, no Y"],
    ["## Setup\nNo setup, no config.", "no X, no Y"],
    ["He said \u201Cdone.\u201D\nNo setup, no config.", "no X, no Y"],
    ["See https://example.com.\nNo setup, no config.", "no X, no Y"],
    ["- It ships today.\n  No meetings, no Slack.", "no X, no Y"],
    ["Like most cities, it faces several challenges.", "faces challenges"],
    ["The details aren\u2019t widely documented.", "not widely documented"],
    ["The claim should be treated as tradition rather than history.", "should be treated as X rather than Y"],
    ["In this section, we will discuss the background.", "in this section, we will"],
    ["Founded in [Year] by [Your Name].", "placeholder"],
    ["Accessed 2025-XX-XX.", "placeholder"],
    ["See INSERT_SOURCE_URL_30 for details.", "placeholder"],
    ["See PASTE_SOURCE_URL_30 for details.", "placeholder"],
    ["Official site: (Add your channel URL here)", "placeholder"],
  ];
  for (const [text, rule] of cases) {
    assert.ok(rules(text).includes(rule), `expected ${rule} for: ${text}; got ${rules(text).join(", ")}`);
  }
});

test("flags watch words only when different ones share a paragraph", () => {
  // One watch word is ordinary English.
  assert.deepEqual(check("The parser is robust."), []);
  // Two forms of one word count once.
  assert.deepEqual(check("Highlight the row. The highlighted row stays."), []);
  // A blank line or a heading ends the paragraph.
  assert.deepEqual(check("The parser is robust.\n\nThe test is crucial."), []);
  assert.deepEqual(check("The parser is robust.\n## Tests\nThe test is crucial."), []);
  // Each list item and table row is its own block.
  assert.deepEqual(check("- Add a robust retry.\n- Fix the cache key.\n- Enhance the log format."), []);
  assert.deepEqual(check("| a | robust |\n| b | enhanced |"), []);
  assert.deepEqual(check("1. Add a robust retry.\n2. Fix the cache key.\n3. Enhance the log format."), []);
  // A list item that wraps onto a second line is still one block.
  assert.equal(rules("- Add a robust retry\n  that will enhance uploads.").length, 2);
  // Two different words are enough.
  assert.deepEqual(rules("The robust parser will enhance throughput."), [
    'AI vocabulary "robust" (2 in one paragraph)',
    'AI vocabulary "enhance" (2 in one paragraph)',
  ]);
  assert.deepEqual(
    rules("Additionally, the robust parser\nwill enhance throughput."),
    [
      'AI vocabulary "additionally" (3 in one paragraph)',
      'AI vocabulary "robust" (3 in one paragraph)',
      'AI vocabulary "enhance" (3 in one paragraph)',
    ],
  );
});

test("leaves ordinary technical prose alone", () => {
  const clean = [
    "## [Unreleased]",
    "",
    "Removes the host from the URL while preserving everything else.",
    "The lock ensures one writer at a time. Use the [API key](https://example.com/key) to sign in.",
    "It's not supported on Windows. No changes are needed.",
    "If there is no token, no request is sent. No token, no request is sent.",
    "With no config file, no output is written.",
    "Call insert_row to add data, or use paste_buffer.",
    "",
    "The worker keeps",
    "no cache, no queue.",
  ].join("\n");
  assert.deepEqual(check(clean), []);
});

test("reports a rule once per line", () => {
  assert.deepEqual(rules("Fill in [Your Name] and INSERT_URL_HERE."), ["placeholder"]);
});

test("words inside other words do not match", () => {
  assert.deepEqual(check("The underscored_name and showcaseItem are identifiers. Fostering is flagged."), [
    { line: 1, rule: 'phrase "fostering"', excerpt: "The underscored_name and showcaseItem are identifiers. Fostering is flagged." },
  ]);
});
