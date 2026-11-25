---
name: apply-repo-standards
description: Bring a repo in line with the way your other repos are set up, by copying from them. Compares the toolchain, tests, lint, CI, release setup and docs with one or two reference repos, shows the gaps, and fixes them one area per pull request. Use when asked to set this up like my other repos, add mise, switch CI to the mise action, set up release-it, set up trusted publishing, add a release workflow, or make this repo follow my conventions.
---

# Apply repo standards

Input: a target repo, and one or two reference repos by the same owner. Output: a table of gaps, then one pull request per area.

The reference repo is the source. Copy what it does, and change only what the target needs. Do not design a new setup.

## Steps

### 1. Pick the reference

Use the repos the user names. Otherwise pick the owner's most recently updated repos in the same language that have a release setup. Say which you picked.

### 2. Read both sides

| Area | Files to read |
|---|---|
| Toolchain | `.mise.toml` or `mise.toml`, `engines` in `package.json` |
| Scripts | `scripts` in `package.json`: build, test, lint, format |
| Tests | The test config, and how tests build fixtures |
| Lint and format | The ESLint and Prettier config |
| CI | `.github/workflows/*.yml`, `.github/dependabot.yml` |
| Release | The release config, `RELEASE.md`, the release workflow |
| Docs | `README.md`, `AGENTS.md`, `LICENSE`, `CHANGELOG.md` |

### 3. Show the gaps

| Area | Reference | Target | Change |
|---|---|---|---|

Ask which areas to apply when the user did not say.

### 4. Apply, one area per pull request

Use these defaults when the reference agrees with them. When the reference differs, follow the reference.

- **Toolchain:** `mise` pins the tools in `.mise.toml`. CI installs them with the mise action, and never with a setup action that hardcodes a version. Commands stay plain, such as `npm ci` and `npm test`. Wrapping every command in `mise exec` means the setup is wrong.
- **Tests:** `vitest`. An end-to-end test is a real test in the test runner, not a shell script. Tests that need files build a real temporary project with a fixture library instead of mocking the file system.
- **Lint:** ESLint and Prettier, and `npm test` runs the lint step.
- **Release:** `release-it` with the lerna-changelog plugin, changelog labels on pull requests, a `RELEASE.md`, and a release workflow started by hand with an increment input and a dry-run input. The workflow publishes with npm trusted publishing, so no token is stored. A pull request that changes the release setup gets a dry run.
- **Dependencies:** version ranges, not exact pins, unless the repo already pins. Use a maintained library before you write custom code. Write scripts in the repo's own language.
- **Docs:** a README that says what the package is, why it exists, how to install it and how to use it, modelled on the reference README.
- **Actions:** current major versions of every GitHub Action.

### 5. Verify

Each pull request's CI is green. For a release setup, the dry run prints the expected version and changelog. See `verify-end-to-end`.

### 6. List what only the user can do

Some steps need the owner's account, and the agent cannot do them. List each one with the exact values to enter:

- Add the trusted publisher on the registry: the repo, the workflow file name and the environment name.
- Create the deployment environment in the repo's settings and limit it to the default branch.
- Publish the first version by hand, when the registry needs the package to exist before it accepts a trusted publisher.

## Done when

- The gap table lists every area, including the ones left unchanged.
- Each applied area has its own pull request with green CI.
- The steps only the user can do are listed with their exact values.
