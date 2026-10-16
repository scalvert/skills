# Spec fit

Compare the change with what it was asked to do. The request is in `spec.md` (PR description and linked issues); without it, use the commit messages and PR title as the stated intent.

Look for a requirement the change misses, behavior the change adds that nobody asked for, and acceptance criteria the change contradicts. Quote the sentence of the spec each finding depends on.

When the change fixes a bug, check that it fixes the cause and not one symptom. Find the other inputs and callers that reach the same cause, and report any the fix leaves broken.
