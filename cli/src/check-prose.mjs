// Checks prose for the mechanical write-clearly rules: dashes used as
// punctuation, emoji, title-case headings, and phrasing that reads as
// generated. Code blocks, inline code, URLs and block quotes are exempt.
//
// Usage:
//   agent-review prose <file ...>      check files
//   agent-review prose                 check stdin
//   agent-review prose --json ...      print findings as JSON
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

// Blanks out text the rules do not apply to, keeping line numbers and columns.
export function maskExempt(text) {
  const lines = text.split(/\r?\n/);
  let fence = null;
  return lines.map((line) => {
    const open = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return "";
    }
    if (open) {
      fence = open[1];
      return "";
    }
    if (/^\s*>/.test(line)) return "";
    return line
      .replace(/`[^`]*`/g, (m) => " ".repeat(m.length))
      .replace(/\bhttps?:\/\/\S+/g, (m) => " ".repeat(m.length))
      .replace(/\[([^\]]*)\]\([^)]*\)/g, (m, label) => label + " ".repeat(m.length - label.length));
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

