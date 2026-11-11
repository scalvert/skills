// Checks prose for the mechanical write-clearly rules: dashes used as
// punctuation, emoji, title-case headings, unfilled placeholders, and
// phrasing that reads as generated. Code blocks, inline
// code, URLs and block quotes are exempt.
//
// Most of the phrasing rules come from Wikipedia's field guide to AI
// writing (https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).
// Each entry is there because generated text uses it far more often than
// people do. A word that people also use often goes in WATCH_WORDS, which
// only flags a cluster, not in PHRASES, which flags every use.
//
// Usage:
//   agent-review prose <file ...>      check files
//   agent-review prose                 check stdin
//   agent-review prose --json ...      print findings as JSON
//   agent-review prose --github ...    also check text bound for GitHub (see checkGithub)
// Exits 1 when anything is flagged.

// Flagged wherever they appear.
export const PHRASES = [
  // AI vocabulary.
  "delve", "delves", "delved", "delving", "foster", "fosters", "fostered", "fostering", "garner", "garners",
  "garnered", "garnering", "interplay", "intricate", "intricacies", "landscape", "pivotal", "showcase",
  "showcases", "showcased", "showcasing", "testament", "underscore", "underscores", "underscored", "underscoring",
  "tapestry", "meticulous", "meticulously", "multifaceted", "deep dive", "valuable insights", "seamless",
  "seamlessly", "groundbreaking", "vibrant", "world-class", "game-changer",
  // Claims about significance and legacy.
  "setting the stage for", "sets the stage for", "marks a shift", "marking a shift", "represents a shift",
  "key turning point", "indelible mark", "deeply rooted", "focal point", "reflects broader", "reflecting broader",
  "enduring legacy", "lasting legacy", "symbolizing", "social media presence",
  // "Is" and "has" dressed up.
  "serves as", "stands as", "boasts", "boasting", "holds the distinction",
  // Negative parallelisms.
  "not only", "isn't just", "is not just", "aren't just", "are not just", "not merely",
  // "Why this matters" framing.
  "why this matters", "why it matters", "this matters because", "the distinction matters",
  // Vague attribution.
  "industry reports", "observers have cited", "experts argue", "experts say", "some critics argue",
  // Formula endings.
  "despite these challenges", "continues to evolve", "continue to evolve", "future outlook", "future prospects",
  "in conclusion",
  // Filler and signposting.
  "it is important to note", "it's important to note", "it's worth noting", "it is worth noting",
  "it is important to remember", "it's important to remember", "in order to", "due to the fact that",
  "it is crucial to", "it's crucial to", "has the ability to", "let's dive in", "in today's fast-paced",
  "at the end of the day", "rest assured",
  // Disclaimers about sources.
  "based on available information", "based on the available information", "in the provided sources",
  "in the available sources", "provided search results", "does not by itself establish", "does not establish that",
  "doesn't establish that",
  // Talking to the user inside the text.
  "i hope this helps", "i hope this message finds you well", "great question", "you're absolutely right",
  "certainly!", "of course!", "is there anything else", "would you like me to", "detailed breakdown",
  "carefully reviewed", "any inconvenience",
  // Change summaries that assert quality or list what did not change.
  "streamlined", "improved clarity", "improves clarity", "improve clarity",
  "clarity and flow", "improved readability", "enhanced readability", "addressed reviewer feedback",
  "addressed the reviewer's feedback",
];

// Words people use too. One is fine; generated text stacks them, so they
// are flagged only when WATCH_LIMIT different words share a paragraph.
// Each entry lists the forms of one word, so "highlight" and "highlighting"
// count once.
export const WATCH_WORDS = [
  ["additionally"], ["align with", "aligns with", "aligned with"], ["bolster", "bolsters", "bolstered"],
  ["crucial"], ["emphasize", "emphasizes", "emphasizing"], ["enduring"], ["enhance", "enhances", "enhanced", "enhancing"],
  ["highlight", "highlights", "highlighted", "highlighting"], ["robust"], ["valuable"],
  ["leverage", "leverages", "leveraging"], ["prioritize", "prioritizes", "prioritizing"], ["quietly"], ["steady"],
  ["dependable"], ["universally"], ["echoed"], ["resonate", "resonates"], ["encompassing"], ["cultivating"],
  ["in connection with"],
];
export const WATCH_LIMIT = 2;

// Shapes that a fixed phrase cannot catch. Each runs on the lowercased line.
export const PATTERNS = [
  // "..., highlighting its importance": analysis tacked onto a fact.
  {
    rule: "trailing -ing clause",
    re: /,\s+(?:highlighting|underscoring|emphasizing|showcasing|reflecting|symbolizing|ensuring|fostering|cultivating|enhancing|solidifying|demonstrating|illustrating|contributing to|marking)\b/,
  },
  { rule: "plays a key role", re: /\bplay(?:s|ed|ing)? an? (?:crucial|vital|key|pivotal|significant|central|critical) role\b/ },
  { rule: "faces challenges", re: /\bfac(?:es|ed|ing) (?:several |many |numerous |significant |new )?challenges\b/ },
  { rule: "not widely documented", re: /(?:\bnot|n't) (?:widely|extensively|well|publicly) (?:documented|available|known)\b/ },
  // "X should be treated as A rather than B": a corrective framing nobody asked for.
  { rule: "should be treated as X rather than Y", re: /\bshould be (?:treated|understood|read|seen|presented) as [^.;]{1,80}\brather than\b/ },
  { rule: "in this section, we will", re: /\bin this (?:section|article|document|guide|post),? (?:we|i) will\b/ },
  { rule: "it's not X, it's Y", re: /\b(?:it|this|that)(?:'s| is) not [^.;:!?]{1,60}[,;] (?:it|this|that)(?:'s| is)\b/ },
  // A verbless fragment that opens a sentence: "No guessing, no wasted motion."
  // A conditional such as "If there is no token, no request is sent." is fine.
  {
    rule: "no X, no Y",
    re: /(?:^[\s>*+\-\d.)]*|[.!?:]\s+)no [a-z]+(?: [a-z]+)?, no [a-z]+(?: [a-z]+)?(?:[,.;!]|$| just\b)/,
  },
  // [Your Name], 2026-XX-XX, (Add your URL here).
  {
    rule: "placeholder",
    re: /\[(?:your|insert|add|describe|link to|name of|year|date)\b[^\]]*\]|\b\d{4}-xx(?:-xx)?\b|\b(?:add|insert|paste) your [^.]{1,40} here\b/,
  },
  // INSERT_SOURCE_URL_HERE. Matched on the original case, so that an
  // identifier such as insert_row is not a placeholder.
  { rule: "placeholder", cased: true, re: /\b(?:INSERT|PASTE)_[A-Z0-9_]+\b/ },
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A phrase matches as whole words: "foster" does not match "fosterage",
// and "underscored" does not match the identifier underscored_name.
const phraseRe = (phrase) => new RegExp(`(^|[^a-z0-9_])${escapeRe(phrase)}([^a-z0-9_]|$)`);
const PHRASE_RES = PHRASES.map((p) => [p, phraseRe(p)]);
const WATCH_RES = WATCH_WORDS.flatMap((forms) => forms.map((p) => [p, phraseRe(p), forms[0]]));

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "if", "in", "nor", "of", "on", "or", "so", "the", "to", "up", "via", "vs", "with", "yet",
]);

const EMOJI = /\p{Extended_Pictographic}/u;

// Code spans as CommonMark reads them: a run of k backticks opens a span
// that the next run of exactly k backticks closes. Outside a span, a
// backslash escapes the backtick right after it, which GitHub then shows as
// a literal backtick. Inside a span, a backslash is literal, so `C:\temp\`
// is one span. Returns the spans as [start, end) ranges, the opening runs
// that nothing closes, and the positions of escaped backticks.
export function codeSpans(text) {
  const runs = [...text.matchAll(/`+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
  const spans = [];
  const unmatched = [];
  const escaped = [];
  for (let i = 0; i < runs.length; i++) {
    let { start, end } = runs[i];
    let slashes = 0;
    while (text[start - 1 - slashes] === "\\") slashes += 1;
    if (slashes % 2 === 1) {
      escaped.push(start);
      start += 1;
      if (start === end) continue;
    }
    const size = end - start;
    const close = runs.findIndex((r, j) => j > i && r.end - r.start === size);
    if (close === -1) {
      unmatched.push({ start, end, size });
      continue;
    }
    spans.push([start, runs[close].end]);
    i = close;
  }
  return { spans, unmatched, escaped };
}

// A line that starts a new Markdown block, so a code span cannot continue
// into it from the line above: a heading, a list item, a table row, or a
// thematic break.
const BLOCK_START = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||(?:[-*_]\s*){3,}$)/;

// Code spans for each line of a document. Spans pair within a paragraph,
// across its lines, as GitHub renders them. Fenced code and block quotes
// get null: no rule looks inside them.
export function spanMap(lines) {
  const out = lines.map(() => null);
  let fence = null;
  let block = [];
  const flush = () => {
    if (!block.length) return;
    const offsets = [];
    let pos = 0;
    for (const i of block) {
      offsets.push(pos);
      pos += lines[i].length + 1;
    }
    const { spans, unmatched, escaped } = codeSpans(block.map((i) => lines[i]).join("\n"));
    block.forEach((i, k) => {
      const from = offsets[k];
      const to = from + lines[i].length;
      const inLine = (p) => p >= from && p < to;
      out[i] = {
        spans: spans.filter(([s, e]) => s < to && e > from).map(([s, e]) => [Math.max(s, from) - from, Math.min(e, to) - from]),
        unmatched: unmatched.filter((u) => inLine(u.start)).length,
        escaped: escaped.filter(inLine).length,
      };
    });
    block = [];
  };
  lines.forEach((line, i) => {
    const open = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return;
    }
    if (open) {
      flush();
      fence = open[1];
      return;
    }
    if (/^\s*>/.test(line) || !line.trim()) {
      flush();
      return;
    }
    if (BLOCK_START.test(line)) flush();
    block.push(i);
  });
  flush();
  return out;
}

const blank = (line, ranges) => {
  let out = line;
  for (const [s, e] of ranges) out = out.slice(0, s) + " ".repeat(e - s) + out.slice(e);
  return out;
};

// Blanks out text the rules do not apply to, keeping line numbers and columns.
// With { links: true } link labels are blanked too, because a label such as
// [src/page.js](url) is a link, not code that needs backticks.
export function maskExempt(text, { links = false } = {}) {
  const lines = text.split(/\r?\n/);
  const map = spanMap(lines);
  const label = (m, text) => (links ? " ".repeat(m.length) : text + " ".repeat(m.length - text.length));
  return lines.map((line, i) => {
    if (!map[i]) return "";
    return blank(line, map[i].spans)
      // Links before bare URLs: the URL pattern would also eat the link's ")".
      // Inline links [label](url), then reference links [label][ref] and [label][].
      .replace(/\[([^\]]*)\]\([^)]*\)/g, label)
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, label)
      .replace(/\bhttps?:\/\/\S+/g, (m) => " ".repeat(m.length));
  });
}

function isTitleCase(heading) {
  const words = heading
    .replace(/[`*_[\]()]/g, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w));
  if (words.length < 3) return false;
  const significant = words.slice(1).filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  if (significant.length < 2) return false;
  // Words that are capitalized everywhere (names, acronyms) are not evidence.
  const capitalized = significant.filter((w) => /^[A-Z]/.test(w) && !/^[A-Z0-9]+$/.test(w) && !/[a-z][A-Z]/.test(w));
  return capitalized.length === significant.length;
}

export function check(text) {
  const findings = [];
  const add = (line, rule, excerpt) => findings.push({ line, rule, excerpt: excerpt.trim().slice(0, 80) });
  // Watch words seen in the current paragraph, flagged when it ends.
  let watched = [];
  const endParagraph = () => {
    const distinct = new Set(watched.map((w) => w.family));
    if (distinct.size >= WATCH_LIMIT) {
      watched.sort((a, b) => a.line - b.line || a.at - b.at);
      for (const w of watched) add(w.line, `AI vocabulary "${w.word}" (${distinct.size} in one paragraph)`, w.text);
    }
    watched = [];
  };
  // Whether the next line starts a sentence. A hard-wrapped line that
  // continues a sentence does not.
  let sentenceStart = true;
  // The end-of-sentence test reads the raw line, because masking blanks a
  // URL together with the period after it.
  const raw = text.split(/\r?\n/);
  maskExempt(text).forEach((line, i) => {
    const n = i + 1;
    if (!line.trim()) {
      endParagraph();
      sentenceStart = true;
      return;
    }
    // Each list item and table row is its own block.
    const block = BLOCK_START.test(line);
    if (block) endParagraph();
    const startsSentence = sentenceStart || block;
    // A heading ends its own sentence, with or without punctuation.
    sentenceStart =
      /^\s{0,3}#{1,6}\s/.test(line) || /[.!?:]["')\]*_\u201D\u2019]*\s*$/.test(raw[i]);
    if (line.includes("\u2014")) add(n, "em dash", line);
    if (line.includes("\u2013")) add(n, "en dash", line);
    // A double hyphen between words is a typed dash. Table rules and CLI
    // flags (" --draft") are not.
    if (/\w\s--\s\w|\w--\w/.test(line) && !/^\s*\|/.test(line)) add(n, "double hyphen", line);
    if (EMOJI.test(line)) add(n, "emoji", line);
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (heading && isTitleCase(heading[1])) add(n, "title-case heading", heading[1]);
    if (heading) endParagraph();
    // A curly apostrophe counts as a straight one, so "it's" matches either way.
    const lower = line.toLowerCase().replace(/[\u2018\u2019]/g, "'");
    for (const [phrase, re] of PHRASE_RES) {
      if (re.test(lower)) add(n, `phrase "${phrase}"`, line);
    }
    // A prefix stops a pattern's line-start anchor from treating the middle
    // of a sentence as its start.
    const lowerInSentence = startsSentence ? lower : `~ ${lower}`;
    const matched = new Set();
    for (const { rule, re, cased } of PATTERNS) {
      if (!matched.has(rule) && re.test(cased ? line : lowerInSentence)) {
        matched.add(rule);
        add(n, rule, line);
      }
    }
    for (const [word, re, family] of WATCH_RES) {
      const at = lower.search(re);
      if (at >= 0) watched.push({ word, family, line: n, at, text: line });
    }
    if (heading) endParagraph();
  });
  endParagraph();
  return findings.sort((a, b) => a.line - b.line);
}

// Text that looks like code. Each pattern is narrow on purpose: a false flag
// costs the writer a pair of backticks, but a noisy check gets ignored.
const CODE_PATTERNS = [
  // listThreads(), opts.load(x). Not plural hints such as "lens(es)".
  { kind: "call", re: /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\((?!s\)|es\))[^()\s]*\)/g },
  // src/page.js:42
  { kind: "file and line", re: /(?<![\w/.-])[\w./-]*\.[A-Za-z][\w]{0,5}:\d+\b/g },
  // src/page.js, cli/src/, ./scripts
  { kind: "path", re: /(?<![\w/.-])(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]*(?![\w/])/g },
  // package.json, SKILL.md, guard.mjs
  {
    kind: "file name",
    re: /(?<![\w/.-])[\w-]+\.(?:m?js|cjs|tsx?|jsx|json|ya?ml|toml|md|py|go|rs|rb|java|kt|swift|sh|css|scss|html|sql|lock|env)\b/g,
  },
  // --since, --dry-run
  { kind: "flag", re: /(?<![\w-])--[a-z][\w-]*/g },
  // opts.repoDir, ledger.rounds
  { kind: "member access", re: /\b[a-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g },
  // finding_id, AGENT_REVIEWS_STATE_DIR
  { kind: "identifier", re: /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/g },
  // repoDir, listThreads
  { kind: "identifier", re: /\b[a-z]+[A-Z][A-Za-z0-9]*\b/g },
];

// Words shaped like code that are ordinary prose.
const NOT_CODE = [
  /^(?:i|mac|watch|tv|vision|ipad)OS$/,
  /^i(?:Phone|Pad|Pod|Cloud|Message|Mac|Tunes)$/,
  /^(?:eBay|gRPC)$/,
  /^(?:e\.g|i\.e|a\.m|p\.m|vs|etc)\.?$/i,
  /^[A-Z][a-z]+\.js$/, // Node.js, Next.js
];
const TLD = /\.(?:com|org|net|io|dev|ai|co|app|gov|edu|us|uk)$/i;

function notCode(token, kind) {
  if (NOT_CODE.some((re) => re.test(token))) return true;
  // example.com is a domain. Paths and file names are code even with a TLD-like part.
  if (kind === "member access" && TLD.test(token)) return true;
  // "and/or", "read/write": a slash between two plain words is prose.
  if (kind === "path" && /^[a-z]+\/[a-z]+$/i.test(token)) return true;
  // 3/4, 2026/10/15
  if (kind === "path" && /^[\d/]+$/.test(token)) return true;
  return false;
}

// Checks text that will be posted to GitHub: review comments, thread
// replies, PR descriptions. On top of the prose rules it flags:
//
//   finding ID             F1, F2: ledger keys that mean nothing on GitHub
//   finding number         finding 2, candidate 3: numbers from the review
//                          in this conversation, which a reader on GitHub
//                          never saw
//   escaped backtick       \` renders as a literal backtick, not code; this is
//                          what a body inlined in a shell string turns into
//   unformatted code       code outside backticks (calls, paths, flags, identifiers)
//   unbalanced backticks   a backtick run that nothing closes
//   fence without language a multi-line code block with no language
export function checkGithub(text) {
  const findings = check(text);
  const add = (line, rule, excerpt) => findings.push({ line, rule, excerpt: excerpt.trim().slice(0, 80) });
  const raw = text.split(/\r?\n/);
  let fence = null;
  raw.forEach((line, i) => {
    const open = line.match(/^\s*(```+|~~~+)\s*(\S*)/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !open[2]) fence = null;
      return;
    }
    if (open) {
      fence = open[1];
      if (!open[2]) add(i + 1, "fence without language", line);
    }
  });
  spanMap(raw).forEach((m, i) => {
    if (!m) return;
    if (m.escaped) add(i + 1, "escaped backtick (post the body from a file, not a shell string)", raw[i]);
    else if (m.unmatched) add(i + 1, "unbalanced backticks", raw[i]);
  });
  // HTML tags and comments (badges, <details>, bot markers) are markup, not prose.
  // Reference-link definitions ([vc]: #...) never render.
  const html = (line) =>
    /^\s{0,3}\[[^\]]+\]:\s/.test(line) ? "" : line.replace(/<!--.*?-->|<\/?[A-Za-z][^<>]*>/g, (m) => " ".repeat(m.length));
  maskExempt(text, { links: true }).map(html).forEach((line, i) => {
    const n = i + 1;
    for (const m of line.matchAll(/\bF\d+\b/g)) add(n, "finding ID", m[0]);
    for (const m of line.matchAll(/\b(?:finding|candidate)s?\s+#?\d+\b/gi)) add(n, "finding number", m[0]);
    // Patterns run from widest to narrowest. A match inside one already
    // reported (repoDir inside opts.repoDir) is the same code, reported once.
    const covered = [];
    for (const { kind, re } of CODE_PATTERNS) {
      for (const m of line.matchAll(re)) {
        // Trailing punctuation and emphasis markers (_in place._) are not part of the code.
        const token = m[0].replace(/[.,;:!?*_]+$/, "");
        const start = m.index;
        const end = start + token.length;
        if (!token || notCode(token, kind)) continue;
        if (kind === "member access" && !token.includes(".")) continue;
        if (covered.some(([s, e]) => start >= s && end <= e)) continue;
        covered.push([start, end]);
        add(n, `unformatted code (${kind})`, token);
      }
    }
  });
  return findings.sort((a, b) => a.line - b.line);
}

