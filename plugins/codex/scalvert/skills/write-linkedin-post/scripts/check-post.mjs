#!/usr/bin/env node
// Checks LinkedIn post drafts for what LinkedIn does to text: the length limit, the "see more"
// fold, and formatting it shows as literal characters.
//
// Usage: node check-post.mjs <file>   (or pipe one post on stdin)
// In a Markdown file, each ```text block is one post; any other input is one post.
// Exits 1 if any post has an error; warnings alone exit 0.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LIMIT = 3000;
export const FOLD = 200;

const OPENERS = [
  /\b(i'?m|i am|we'?re|we are) (so )?(excited|thrilled|delighted|proud|happy) to\b/i,
  /\bhere'?s the thing\b/i,
  /\blet that sink in\b/i,
  /\bgame[- ]changer\b/i,
  /\bbig news\b/i,
];
const BAIT = [
  /\b(agree|thoughts)\s*\?\s*$/im,
  /\b(comment|drop) (below|a comment)\b/i,
  /\b(like|repost|share) (this|if)\b/i,
  /\bfollow (me )?for more\b/i,
];

/** Split input into posts: ```text blocks in Markdown, otherwise the whole text. */
export function splitPosts(input) {
  const blocks = [...input.matchAll(/^```text[^\n]*\n([\s\S]*?)^```/gm)].map((m) => m[1].trim());
  return blocks.length ? blocks : [input.trim()];
}

/** Errors and warnings for one post, and what shows above the fold. */
export function checkPost(post) {
  const errors = [];
  const warnings = [];
  const length = [...post].length;
  if (length > LIMIT) errors.push(`${length} characters; LinkedIn's limit is ${LIMIT}`);

  const hook = post.split(/\n\s*\n/)[0];
  if ([...hook].length > FOLD) warnings.push(`the first paragraph is ${[...hook].length} characters, so it runs past the fold (about ${FOLD})`);

  const markdown = [
    [/\*\*[^*\n]+\*\*|__[^_\n]+__/, "bold Markdown (**text**)"],
    [/(^|\s)_[^_\n]+_(?=\s|[.,!?]|$)/m, "italic Markdown (_text_)"],
    [/`[^`\n]+`/, "backticks"],
    [/^#{1,6}\s/m, "a Markdown heading"],
    [/\[[^\]\n]+\]\([^)\n]+\)/, "a Markdown link ([text](url))"],
    [/^>\s/m, "a Markdown quote (>)"],
  ];
  for (const [re, what] of markdown) if (re.test(post)) errors.push(`${what}: LinkedIn shows it as typed`);
  if (/[\u{1D400}-\u{1D7FF}]/u.test(post)) errors.push("Unicode bold or italic letters: screen readers spell them out");
  if (/\p{Extended_Pictographic}/u.test(post)) warnings.push("emoji: keep only if the author uses them in their own posts");
  if (/[\u2014\u2013]|\s--\s/.test(post)) errors.push("an em dash, en dash, or double hyphen used as a dash");

  const tags = post.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? [];
  if (tags.length > 3) warnings.push(`${tags.length} hashtags; use at most three`);
  for (const re of OPENERS) if (re.test(post)) warnings.push(`stock phrase: "${post.match(re)[0]}"`);
  for (const re of BAIT) if (re.test(post)) warnings.push(`engagement bait: "${post.match(re)[0].trim()}"`);

  const urls = post.match(/https?:\/\/\S+/g) ?? [];
  return { length, fold: [...post].slice(0, FOLD).join(""), urls, errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  const input = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
  let failed = false;
  splitPosts(input).forEach((post, i) => {
    const r = checkPost(post);
    console.log(`post ${i + 1}: ${r.length} characters`);
    console.log(`  above the fold: ${JSON.stringify(r.fold)}`);
    for (const u of r.urls) console.log(`  link: ${u} (open it and check it resolves)`);
    for (const e of r.errors) console.log(`  error: ${e}`);
    for (const w of r.warnings) console.log(`  warning: ${w}`);
    if (r.errors.length) failed = true;
  });
  process.exit(failed ? 1 : 0);
}
