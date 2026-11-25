---
name: verify-end-to-end
description: Prove that a change works by running the real flow the way a user would, then inspecting the result. Refuses dry runs, fixtures and mocks as proof, records the evidence for each claim, and says what stayed unverified. Use when asked to verify, validate, test end to end, prove it works, run it for real, show me evidence, or how did you verify that, and before you report that work is done.
---

# Verify end to end

Input: a change and what it is meant to do. Output: a table of claims with the evidence for each one.

A command that exits 0 is not proof. A passing unit test is not proof that the feature works for a user. This skill runs the real thing and looks at what it produced.

## Steps

### 1. Write the claims

List what must be true for a user, one line each. "The CLI installs from the published tarball and `init` creates a config file" is a claim. "Tests pass" is not.

### 2. Pick the real path

Use the path a user takes:

| The change is | Run |
|---|---|
| A package or CLI | `npm pack`, install the tarball in an empty temporary folder, run the command |
| A web page or UI | Start the app, open the page in a browser, take a screenshot |
| A service or API | Call the running service with a real request, read the response and the logs |
| Instructions or a tutorial | Follow them in a clean folder, exactly as written, with no knowledge the page does not give |
| A workflow or pipeline | Trigger it, wait for it to finish, open its output |
| A release | Read the version from the registry, install it, run it |

A dry run, a fixture, a mock or a simulated mode does not count, unless the user asked for one. When the real path needs something only the user has, such as a credential, an unlocked password manager or an approval, stop and ask for it. Do not fall back to a fake and report success.

### 3. Run from a clean state

Use a fresh folder or checkout, so that leftover files from development cannot make the run pass. Say when the run needs the machine to itself, for example a test that drives the screen, so the user can keep their hands off.

### 4. Inspect the result

Open what the run produced: the file, the page, the published version, the report, the log. Read its content. A file that exists can still be wrong.

### 5. Fix and rerun

When a step fails, fix the cause, then run the whole flow again from the start. Rerunning only the failed step can hide a problem in an earlier step.

### 6. Report

| Claim | How it was checked | Evidence | Result |
|---|---|---|---|
| The exact claim | The command or action | The output line, file path, URL or screenshot | Verified, failed or not verified |

Below the table, list what you did not verify and why. Write "not verified" when you did not run it. Never write "should work".

## Done when

- Every claim has a result and evidence from this run.
- Each failure was fixed and the full flow was rerun, or it is reported as failed.
- The report lists what stayed unverified.
