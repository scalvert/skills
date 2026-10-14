#!/usr/bin/env node
// Read-only helpers for answering PR review threads. This script never
// writes to GitHub: replies, resolves and review requests are separate gh
// commands the agent runs itself, so the repo permission rules and the guard
// hook see each one.
//
// Usage:
//   review-threads.mjs list  --pr <number> [--repo owner/repo] [--all]
//       Unresolved review threads (all threads with --all), oldest first.
//   review-threads.mjs owner --path <file> --line <n> [--repo owner/repo]
//       The commit that last changed that line and the open PR that contains
//       it, so a fix lands in the PR that introduced the code (stacked PRs).

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 }).trim();

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      headRefName
      threads: reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line originalLine
          comments(first: 100) { pageInfo { hasNextPage } nodes { id databaseId author { login } body url createdAt } }
        }
      }
    }
  }
}`;

function repoSlug(override) {
  if (override) return override;
  return run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
}

export function shapeThreads(nodes, { includeResolved = false } = {}) {
  return nodes
    .filter((t) => includeResolved || !t.isResolved)
    .map((t) => {
      const comments = t.comments.nodes.map((c) => ({
        id: c.id,
        databaseId: c.databaseId,
        author: c.author?.login ?? "ghost",
        body: c.body,
        url: c.url,
        createdAt: c.createdAt,
      }));
      return {
        threadId: t.id,
        path: t.path,
        // `line` is on the PR head. An outdated thread has none: its
        // `originalLine` is on an older commit and must not be blamed at HEAD.
        line: t.line ?? null,
        originalLine: t.originalLine ?? null,
        commentsTruncated: Boolean(t.comments.pageInfo?.hasNextPage),
        outdated: t.isOutdated,
        resolved: t.isResolved,
        author: comments[0]?.author ?? null,
        url: comments[0]?.url ?? null,
        comments,
      };
    })
    .sort((a, b) => (a.comments[0]?.createdAt ?? "").localeCompare(b.comments[0]?.createdAt ?? ""));
}

export function listThreads({ pr, repo, all }) {
  const [owner, name] = repoSlug(repo).split("/");
  const nodes = [];
  let cursor = null;
  do {
    const args = ["api", "graphql", "-f", `query=${THREADS_QUERY}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${pr}`];
    if (cursor) args.push("-F", `cursor=${cursor}`);
    const page = JSON.parse(run("gh", args)).data.repository.pullRequest.threads;
    nodes.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return shapeThreads(nodes, { includeResolved: Boolean(all) });
}

export function parseBlame(porcelain) {
  const sha = porcelain.split("\n")[0]?.split(" ")[0];
  const summary = porcelain.match(/^summary (.*)$/m)?.[1] ?? null;
  return sha && /^[0-9a-f]{40}$/.test(sha) ? { sha, summary } : null;
}

export function owner({ path, line, repo }) {
  if (!/^\d+$/.test(String(line ?? ""))) {
    throw new Error("--line must be the thread's current line on the PR head; an outdated thread has none, so find the code by hand");
  }
  const blameArgs = ["blame", "--porcelain", "-L", `${line},${line}`, "HEAD", "--", path];
  let porcelain;
  try {
    porcelain = run("git", blameArgs);
  } catch (err) {
    // A blame.ignoreRevsFile in the user's global config breaks blame in any
    // repo that lacks that file, and neither -c nor --ignore-revs-file ""
    // overrides it. Retry without the global config.
    if (!/ignore-revs|could not open object name list/.test(String(err.stderr))) throw err;
    porcelain = execFileSync("git", blameArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
    }).trim();
  }
  const blame = parseBlame(porcelain);
  if (!blame) throw new Error(`could not blame ${path}:${line}`);
  const prs = JSON.parse(
    run("gh", ["pr", "list", "--repo", repoSlug(repo), "--state", "open", "--search", blame.sha, "--json", "number,headRefName,baseRefName,title"]),
  );
  return { ...blame, prs };
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--all") o.all = true;
    else if (argv[i].startsWith("--")) o[argv[i].slice(2)] = argv[++i];
  }
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = args(rest);
  try {
    if (cmd === "list" && o.pr) console.log(JSON.stringify(listThreads(o), null, 2));
    else if (cmd === "owner" && o.path && o.line) console.log(JSON.stringify(owner(o), null, 2));
    else {
      console.error("usage: review-threads.mjs list --pr <n> [--repo o/r] [--all] | owner --path <file> --line <n> [--repo o/r]");
      process.exit(2);
    }
  } catch (err) {
    console.error(`review-threads: ${err.stderr?.toString().trim() || err.message}`);
    process.exit(2);
  }
}
