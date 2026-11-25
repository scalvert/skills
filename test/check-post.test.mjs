import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPost, splitPosts, FOLD } from "../shared/scalvert/skills/write-linkedin-post/scripts/check-post.mjs";

const scriptsDir = fileURLToPath(new URL("../shared/scalvert/skills/write-linkedin-post/scripts", import.meta.url));
const fence = "Example:\n\n```js\nconsole.log(1);\n```";

function run(script, input) {
  return spawnSync(process.execPath, [script], { input, encoding: "utf8" });
}

const clean = [
  "Your setup page is already a procedure. Mark it up, and the build turns it into a skill an agent can follow.",
  "",
  "1. Wrap the procedure in AgentGuide.",
  "2. Put each step in a Step, with a Check.",
  "",
  "Agent guides: https://example.com/docs/guides/agent-guides",
].join("\n");

test("a clean post has no errors or warnings, and lists its links", () => {
  const r = checkPost(clean);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.urls, ["https://example.com/docs/guides/agent-guides"]);
  assert.equal(r.fold, clean.slice(0, FOLD));
});

test("Markdown, Unicode bold, and dashes are errors; emoji is a warning", () => {
  const r = checkPost("**Big** idea with `code`, a [link](https://x.y) \u{1D5D5}old, and \u{1F680} \u2014 here.");
  assert.equal(r.errors.length, 5, r.errors.join("\n"));
  assert.match(r.warnings.join("\n"), /emoji/);
});

test("a post over the limit is an error", () => {
  assert.match(checkPost("a ".repeat(1600)).errors[0], /3200 characters/);
});

test("a long hook, many hashtags, stock openers, and bait are warnings", () => {
  const r = checkPost(`I'm so excited to share ${"x".repeat(FOLD)}\n\nThoughts?\n\n#a #b #c #d`);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 4, r.warnings.join("\n"));
});

test("code names written as plain words aren't flagged as italics or headings", () => {
  const r = checkPost("It reads docs_fetch and SKILL.md, then the #1 result.");
  assert.deepEqual(r.errors, []);
});

test("double-underscore code names aren't bold; __two words__ and **bold** are", () => {
  assert.deepEqual(checkPost("It hooks into __init__ and runs __main__ first.").errors, []);
  assert.deepEqual(checkPost("It reads __dirname.").errors, []);
  for (const post of ["This is __two words__ here.", "This is **bold** here.", "This is **two words** here."]) {
    assert.match(checkPost(post).errors.join("\n"), /bold Markdown/, post);
  }
});

const linkCases = [
  ["Guide: https://a.b/c.", "https://a.b/c"],
  ["https://a.b/c, now", "https://a.b/c"],
  ["(see https://a.b/c)", "https://a.b/c"],
  ["(see https://a.b/c).", "https://a.b/c"],
  ["Read https://en.wikipedia.org/wiki/Foo_(bar)", "https://en.wikipedia.org/wiki/Foo_(bar)"],
  ["Read https://en.wikipedia.org/wiki/Foo_(bar).", "https://en.wikipedia.org/wiki/Foo_(bar)"],
];

test("links lose trailing sentence punctuation but keep their own parentheses", () => {
  for (const [post, url] of linkCases) assert.deepEqual(checkPost(post).urls, [url], post);
});

test("the CLI prints links without trailing sentence punctuation", () => {
  for (const [post, url] of linkCases) {
    const r = run(join(scriptsDir, "check-post.mjs"), post);
    assert.match(r.stdout, new RegExp(`^  link: ${url.replace(/[.()?]/g, "\\$&")} \\(`, "m"), r.stdout);
  }
});

test("single-asterisk italics and code fences are errors", () => {
  assert.match(checkPost("Use *this* now").errors.join("\n"), /italic Markdown \(\*text\*\)/);
  assert.match(checkPost(fence).errors.join("\n"), /code fence/);
  assert.deepEqual(checkPost("5 * 3 * 2 is 30.").errors, []);
});

test("the CLI exits 1 for single-asterisk italics and code fences on stdin", () => {
  for (const [input, what] of [["Use *this* now", /italic Markdown/], [fence, /code fence/]]) {
    const r = run(join(scriptsDir, "check-post.mjs"), input);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, what);
  }
});

test("the CLI still checks when run through a symlinked folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "check-post-"));
  try {
    const link = join(dir, "scripts");
    symlinkSync(scriptsDir, link);
    const r = run(join(link, "check-post.mjs"), "**Bad** post");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /error: bold Markdown/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a ```js line inside a ```text block stays in the post", () => {
  const md = "```text\nExample:\n\n```js\nconsole.log(1);\n```\n";
  const [post] = splitPosts(md);
  assert.match(checkPost(post).errors.join("\n"), /code fence/);
});

test("splitPosts reads ```text blocks, or treats the whole input as one post", () => {
  const md = "# Posts\n\n```text\nOne.\n```\n\nNotes.\n\n```text\nTwo.\n```\n";
  assert.deepEqual(splitPosts(md), ["One.", "Two."]);
  assert.deepEqual(splitPosts("Just a post.\n"), ["Just a post."]);
});
