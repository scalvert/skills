import { defineConfig } from "@gleanwork/pluginpack";
import pkg from "./package.json" with { type: "json" };

const description =
  "Workflow skills for coding agents: code review, review feedback, release readiness, decisions and clear writing.";

export default defineConfig({
  name: "scalvert",
  version: pkg.version,
  metadata: {
    description,
    author: { name: "Steve Calvert", url: "https://github.com/scalvert" },
    owner: { name: "Steve Calvert", url: "https://github.com/scalvert" },
    homepage: "https://github.com/scalvert/skills",
    repository: "https://github.com/scalvert/skills",
    license: "MIT",
  },
  targets: {
    claude: {
      outDir: ".",
      pluginRoot: "plugins/claude",
      plugins: {
        scalvert: {
          source: "shared/scalvert",
          displayName: "scalvert",
          description,
        },
      },
    },
    codex: {
      outDir: ".",
      plugins: {
        scalvert: {
          source: "shared/scalvert",
          overrides: "overrides/codex/scalvert",
          path: "plugins/codex/scalvert",
          displayName: "scalvert",
          description,
          entry: {
            policy: {
              installation: "AVAILABLE",
              authentication: "ON_INSTALL",
            },
            category: "Productivity",
          },
        },
      },
    },
  },
});
