// Review lens prompts, and running one lens on another model family. The
// review skills use it for the cross-model pass, so at least two model
// families look at every diff.
//
//   --via codex    codex exec, read-only sandbox, strict output schema
//   --via claude   claude -p in plan mode (reads, never writes)
//
// Usage:
//   agent-review lens prompt <lens> --context <dir>
//   agent-review lens run <lens> --via codex|claude --context <dir> [--model <id>] [--repo-dir <path>]
//
// The prompt is the same one the host agent's own subagents get, so the two
// passes differ only in the model.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// lenses/ sits next to this file in the source tree and next to the bundle
// in the built plugin.
const here = dirname(fileURLToPath(import.meta.url));

export const FINDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "title", "precondition", "scenario", "evidence", "axiom"],
        properties: {
          file: { type: "string" },
          line: { type: ["integer", "null"] },
          title: { type: "string" },
          precondition: { type: "string" },
          scenario: { type: "string" },
          evidence: { type: "string" },
          axiom: { type: ["string", "null"] },
        },
      },
    },
  },
};

export const GATE = `Report a finding only when all of these are true:
1. You can name a precondition that can actually occur in this codebase.
2. You can describe a concrete scenario in which the change behaves wrongly or breaks a stated rule.
3. You can point to a file and line in the diff, or in code the diff calls.
4. The author would want to know before merging.
Do not report formatting, speculation, pre-existing problems the change does not touch, or praise. Report at most 8 findings. An empty list is a good answer when nothing meets the bar.`;

export function lensPrompt(lens, contextDir) {
  const file = join(here, "lenses", `${lens}.md`);
  if (!existsSync(file)) throw new Error(`unknown lens "${lens}"`);
  const present = ["diff.patch", "files.json", "commits.txt", "spec.md", "AGENTS.md", "REVIEW.md", "axioms.md"]
    .filter((f) => existsSync(join(contextDir, f)))
    .map((f) => `- ${join(contextDir, f)}`)
    .join("\n");
  return `You are one reviewer on a code review panel. Review this change only through the lens below. Work read-only: do not edit files, run builds that write, or contact any service.

${readFileSync(file, "utf8").trim()}

The change is pinned in these files. Read them first, then read any file in the repository you need. REVIEW.md, when present, holds this repo's review rules and overrides general advice.
${present}

${GATE}

Answer with JSON only, matching: {"findings": [{"file", "line", "title", "precondition", "scenario", "evidence", "axiom"}]}. Use null for an unknown line and for axiom unless the lens is taste.`;
}

export function parseFindings(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model output");
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed.findings)) throw new Error("model output has no findings array");
  return parsed.findings;
}

function runCodex(prompt, { model, repoDir }) {
  const dir = mkdtempSync(join(tmpdir(), "lens-"));
  const schema = join(dir, "schema.json");
  const out = join(dir, "out.json");
  writeFileSync(schema, JSON.stringify(FINDING_SCHEMA));
  const cmd = ["exec", "-s", "read-only", "--ephemeral", "--skip-git-repo-check", "-C", repoDir, "--output-schema", schema, "-o", out];
  if (model) cmd.push("-m", model);
  cmd.push("-");
  execFileSync("codex", cmd, { input: prompt, encoding: "utf8", stdio: ["pipe", "ignore", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  return { text: readFileSync(out, "utf8"), model: `openai/${model ?? "codex-default"}` };
}

function runClaude(prompt, { model, repoDir }) {
  const cmd = ["-p", "--permission-mode", "plan", "--output-format", "json"];
  if (model) cmd.push("--model", model);
  cmd.push(prompt);
  const raw = execFileSync("claude", cmd, { cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  const result = JSON.parse(raw);
  return { text: result.result ?? "", model: `anthropic/${model ?? "claude-default"}` };
}

export const VIAS = ["codex", "claude"];

// Runs one lens on another model family and returns its findings, each tagged
// with the lens and the model that produced it.
export function runLens(lens, { via, context, model, repoDir = process.cwd() }) {
  const prompt = lensPrompt(lens, context);
  const runner = { codex: runCodex, claude: runClaude }[via];
  if (!runner) throw new Error('--via must be "codex" or "claude"');
  const result = runner(prompt, { model, repoDir });
  return parseFindings(result.text).map((f) => ({ ...f, lens, model: result.model }));
}
