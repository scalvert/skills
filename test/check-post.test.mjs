import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPost, splitPosts, FOLD } from "../shared/scalvert/skills/write-linkedin-post/scripts/check-post.mjs";

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

test("Markdown, Unicode bold, emoji, and dashes are errors", () => {
  const r = checkPost("**Big** idea with `code`, a [link](https://x.y) \u{1D5D5}old, and \u{1F680} \u2014 here.");
  assert.equal(r.errors.length, 6, r.errors.join("\n"));
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

test("splitPosts reads ```text blocks, or treats the whole input as one post", () => {
  const md = "# Posts\n\n```text\nOne.\n```\n\nNotes.\n\n```text\nTwo.\n```\n";
  assert.deepEqual(splitPosts(md), ["One.", "Two."]);
  assert.deepEqual(splitPosts("Just a post.\n"), ["Just a post."]);
});
