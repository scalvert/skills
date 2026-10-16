// Checks prose for the mechanical write-clearly rules: dashes used as
// punctuation, emoji, title-case headings, and phrasing that reads as
// generated. Code blocks, inline code, URLs and block quotes are exempt.
//
// Usage:
//   agent-review prose <file ...>      check files
//   agent-review prose                 check stdin
//   agent-review prose --json ...      print findings as JSON
//   agent-review prose --github ...    also check text bound for GitHub (see checkGithub)
// Exits 1 when anything is flagged.

export const PHRASES = [
  "delve", "delves", "delving", "foster", "fosters", "fostering", "garner", "garners", "interplay", "intricate",
  "landscape", "pivotal", "showcase", "showcases", "showcasing", "testament", "underscore", "underscores",
  "underscoring", "seamless", "seamlessly", "groundbreaking", "vibrant", "world-class", "game-changer",
  "it is important to note", "it's worth noting", "it is worth noting", "in order to", "due to the fact that",
  "has the ability to", "serves as", "stands as", "boasts", "not only", "i hope this helps", "let's dive in",
  "in today's fast-paced", "at the end of the day", "rest assured",
];

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
  maskExempt(text).forEach((line, i) => {
    const n = i + 1;
    if (line.includes("\u2014")) add(n, "em dash", line);
    if (line.includes("\u2013")) add(n, "en dash", line);
    // A double hyphen between words is a typed dash. Table rules and CLI
    // flags (" --draft") are not.
    if (/\w\s--\s\w|\w--\w/.test(line) && !/^\s*\|/.test(line)) add(n, "double hyphen", line);
    if (EMOJI.test(line)) add(n, "emoji", line);
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (heading && isTitleCase(heading[1])) add(n, "title-case heading", heading[1]);
    const lower = line.toLowerCase();
    for (const phrase of PHRASES) {
      const re = new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
      if (re.test(lower)) add(n, `phrase "${phrase}"`, line);
    }
  });
  return findings;
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

