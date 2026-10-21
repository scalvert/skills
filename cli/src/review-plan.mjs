// Review depth and the model plan: which lenses run, and which model and
// thinking level each role gets.
//
//   depth      quick | standard | deep
//   roles      reviewers (one per lens), verifiers (one per finding), tie-break
//   tiers      fast | strong | tiebreak, each a list of models per host
//
// Model IDs are provider/model and host-specific (Tau uses glean/...,
// Claude Code anthropic/opus and openai/gpt-5.5), so they live in the user's
// config, never in a repo:
//
//   $AGENT_REVIEWS_CONFIG, else $XDG_CONFIG_HOME/agent-reviews/config.json,
//   else ~/.config/agent-reviews/config.json
//
//   {
//     "depth": "standard",
//     "hosts": {
//       "tau": { "fast": ["glean/CLAUDE_5_5_SONNET", "glean/GPT5_4_MINI"],
//                "strong": ["glean/CLAUDE_5_5_OPUS", "glean/GPT6_1_SOL"],
//                "tiebreak": ["glean/GROK_4_7"] }
//     }
//   }
//
// A repo can set its default depth, a lowest depth, and paths that always get
// a deep review, in its review policy, agent-review.json at its root. pin
// reads that file from the merge base with the review harness's parser, so a
// change cannot lower its own review, and the harness checks the same file
// again at the target branch's tip:
//
//   { "version": 1, "review": { "defaultDepth": "standard", "minDepth": "standard", "deepPaths": ["src/auth/**"] } }
//
// The old form, { "review": { "depth", "deepPaths" } }, still works.
//
// Depth comes from, first match wins: --depth, the repo's depth, the user's
// depth, then a suggestion from the diff. minDepth then raises it to at least
// that depth, and a changed path that matches deepPaths raises it to deep.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { family } from "./review-ledger.mjs";

export const DEPTHS = ["quick", "standard", "deep"];
export const HOSTS = ["tau", "claude-code", "codex"];
const TIERS = ["fast", "strong", "tiebreak"];
// provider/model, as the ledger records models. A bare name such as "opus"
// would count as its own family and make a one-family plan look cross-checked.
const MODEL = /^[\w.-]+\/[\w.:@-]+$/;
const STANDARD_MAX_LENSES = 6;

export class PlanError extends Error {}

// What each depth spends, per role. Reviewers decide what gets found;
// verifiers decide what gets reported, so standard keeps verifiers strong and
// spends the strong tier on the two lenses where a miss costs most.
export const DEPTH_RULES = {
  quick: {
    strongLenses: [],
    verifierTier: "fast",
    thinking: { reviewer: "low", verifier: "low", tiebreak: "medium" },
    secondVerifierOnBlockers: false,
  },
  standard: {
    strongLenses: ["correctness", "security"],
    verifierTier: "strong",
    thinking: { reviewer: "medium", verifier: "high", tiebreak: "high" },
    secondVerifierOnBlockers: false,
  },
  deep: {
    strongLenses: "all",
    verifierTier: "strong",
    thinking: { reviewer: "high", verifier: "high", tiebreak: "high" },
    secondVerifierOnBlockers: true,
  },
};

const DOC_FILE = /(^|\/)(docs?\/|README|CHANGELOG)|\.mdx?$/i;
const QUICK_MAX_LINES = 100;

export function userConfigPath() {
  if (process.env.AGENT_REVIEWS_CONFIG) return process.env.AGENT_REVIEWS_CONFIG;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "agent-reviews", "config.json");
}

const checkDepth = (depth, where) => {
  if (depth != null && !DEPTHS.includes(depth)) throw new PlanError(`${where}: depth must be one of ${DEPTHS.join(", ")}, got "${depth}"`);
  return depth ?? null;
};

export function checkUserConfig(config, where = "user config") {
  if (config === null || typeof config !== "object" || Array.isArray(config)) throw new PlanError(`${where} must be a JSON object`);
  checkDepth(config.depth, where);
  if (config.host != null && !HOSTS.includes(config.host)) throw new PlanError(`${where}: host must be one of ${HOSTS.join(", ")}`);
  for (const [host, tiers] of Object.entries(config.hosts ?? {})) {
    for (const [tier, models] of Object.entries(tiers ?? {})) {
      if (!TIERS.includes(tier)) throw new PlanError(`${where}: hosts.${host}.${tier} is not a tier (${TIERS.join(", ")})`);
      if (!Array.isArray(models) || models.some((m) => typeof m !== "string" || !MODEL.test(m))) {
        throw new PlanError(`${where}: hosts.${host}.${tier} must be a list of provider/model IDs, such as anthropic/opus`);
      }
    }
  }
  return config;
}

export function loadUserConfig(path = userConfigPath()) {
  if (!existsSync(path)) return { path, config: {} };
  let config;
  try {
    config = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new PlanError(`${path}: ${e.message}`);
  }
  return { path, config: checkUserConfig(config, path) };
}

export function checkRepoConfig(config, where = "agent-review.json") {
  if (config === null || typeof config !== "object" || Array.isArray(config)) throw new PlanError(`${where} must be a JSON object`);
  const review = config.review ?? {};
  checkDepth(review.depth, `${where} review`);
  const deepPaths = review.deepPaths ?? [];
  if (!Array.isArray(deepPaths) || deepPaths.some((p) => typeof p !== "string" || !p)) {
    throw new PlanError(`${where}: review.deepPaths must be a list of path globs`);
  }
  return { depth: review.depth ?? null, deepPaths };
}

// A path glob: ** matches across folders, * and ? within one.
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i += 1;
      if (glob[i + 1] === "/") {
        i += 1;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

// The depth a diff suggests when nobody chose one: quick for a small change
// that only touches docs, else standard. The security lens is not a reason
// for deep on its own: its pattern matches words such as "shell" and
// "escape", which most changes touch.
export function suggestDepth(files) {
  const lines = files.reduce((n, f) => n + f.added + f.deleted, 0);
  if (files.length && files.every((f) => DOC_FILE.test(f.path)) && lines <= QUICK_MAX_LINES) return "quick";
  return "standard";
}

export function resolveDepth({ flag, repo, user, files }) {
  checkDepth(flag, "--depth");
  let depth;
  let source;
  if (flag) [depth, source] = [flag, "--depth"];
  else if (repo?.depth) [depth, source] = [repo.depth, "agent-review.json"];
  else if (user?.depth) [depth, source] = [user.depth, "user config"];
  else [depth, source] = [suggestDepth(files), "suggested from the diff"];
  const floor = repo?.minDepth;
  if (floor && DEPTHS.indexOf(floor) > DEPTHS.indexOf(depth)) {
    [depth, source] = [floor, `agent-review.json minDepth (raised from ${depth})`];
  }
  const hit = (repo?.deepPaths ?? [])
    .map((g) => [g, globToRegExp(g)])
    .flatMap(([g, re]) => files.filter((f) => re.test(f.path)).map((f) => ({ glob: g, path: f.path })));
  if (hit.length && depth !== "deep") {
    return { depth: "deep", source: `agent-review.json deepPaths (${hit[0].path} matches ${hit[0].glob})`, raisedFrom: depth };
  }
  return { depth, source, raisedFrom: null };
}

// Lenses for a depth, from every lens the diff calls for. standard keeps up
// to six; quick keeps the three that matter most; deep keeps them all and
// adds every lens that can apply.
export function lensesFor(depth, chosen, { hasSpec = false } = {}) {
  if (depth === "standard") return chosen.slice(0, STANDARD_MAX_LENSES);
  if (depth === "quick") {
    const keep = ["correctness", ...(chosen.includes("spec-fit") ? ["spec-fit"] : [])];
    const rest = chosen.filter((l) => !keep.includes(l));
    return [...keep, ...rest].slice(0, 3);
  }
  const extra = ["security", "tests", "api-compat", ...(hasSpec ? ["spec-fit"] : [])];
  const order = ["correctness", "spec-fit", "security", "tests", "api-compat", "taste", "data", "docs"];
  return order.filter((l) => chosen.includes(l) || extra.includes(l));
}

// The innermost host wins: Claude Code started from a Tau shell inherits
// PI_SESSION_ID, so CLAUDECODE is checked first. Codex sets no marker this
// can rely on, so on Codex the skills pass --host codex.
export function detectHost(env = process.env) {
  if (env.CLAUDECODE) return "claude-code";
  if (env.PI_SESSION_ID) return "tau";
  return null;
}

const byFamily = (models) => {
  const groups = new Map();
  for (const m of models) {
    const f = family(m);
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f).push(m);
  }
  return [...groups.entries()];
};

export function resolvePlan({ depth, lenses, host, config = {} }) {
  const rules = DEPTH_RULES[depth];
  const tiers = (host && config.hosts?.[host]) || {};
  const warnings = [];
  const used = { fast: 0, strong: 0 };
  const reviewers = lenses.map((lens) => {
    const tier = rules.strongLenses === "all" || rules.strongLenses.includes(lens) ? "strong" : "fast";
    const groups = byFamily(tiers[tier] ?? []);
    // Alternate families within a tier, so the panel spans them.
    const pick = groups.length ? groups[used[tier]++ % groups.length][1][0] : null;
    return { lens, tier, model: pick, family: pick ? family(pick) : null, thinking: rules.thinking.reviewer };
  });
  const families = new Set(reviewers.map((r) => r.family).filter(Boolean));
  if (reviewers.every((r) => r.model) && families.size < 2) {
    // Two families or the review is not cross-checked: borrow another family
    // from any tier for the last reviewer.
    const other = TIERS.flatMap((t) => tiers[t] ?? []).find((m) => !families.has(family(m)));
    if (other && reviewers.length > 1) Object.assign(reviewers.at(-1), { model: other, family: family(other), tier: "borrowed" });
    else warnings.push("only one model family is configured; the review will not be cross-checked");
  }
  const missing = [...new Set(reviewers.filter((r) => !r.model).map((r) => r.tier))];
  if (!host) warnings.push("host unknown (pass --host): pick each model yourself, following the tiers");
  else if (missing.length) warnings.push(`no ${missing.join(" or ")} models configured for ${host} in the user config: pick those yourself`);
  return {
    depth,
    host: host ?? null,
    lenses,
    reviewers,
    verifier: { tier: rules.verifierTier, models: tiers[rules.verifierTier] ?? [], thinking: rules.thinking.verifier },
    tiebreak: { models: tiers.tiebreak ?? [], thinking: rules.thinking.tiebreak },
    secondVerifierOnBlockers: rules.secondVerifierOnBlockers,
    warnings,
  };
}

// The verifier for one finding: the verifier tier, from a family other than
// the finding's author. Falls back to any configured model of another
// family, then to null (the agent picks).
export function pickVerifier(plan, author, config = {}) {
  const authorFamily = family(author);
  const all = Object.values((plan.host && config.hosts?.[plan.host]) || {}).flat();
  const model = [...plan.verifier.models, ...all].find((m) => family(m) !== authorFamily) ?? null;
  return { model, family: model ? family(model) : null, thinking: plan.verifier.thinking, ...(model ? {} : { note: "no model from another family is configured; pick one yourself" }) };
}

// A tie-break opinion: a family no earlier model on the finding used.
export function pickTiebreak(plan, exclude = [], config = {}) {
  const seen = new Set(exclude.map(family));
  const all = Object.values((plan.host && config.hosts?.[plan.host]) || {}).flat();
  const model = [...plan.tiebreak.models, ...all].find((m) => !seen.has(family(m))) ?? null;
  return { model, family: model ? family(model) : null, thinking: plan.tiebreak.thinking, ...(model ? {} : { note: "no unused family is configured; pick one yourself" }) };
}
