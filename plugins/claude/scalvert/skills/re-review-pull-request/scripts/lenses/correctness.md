# Correctness

Look for code that does the wrong thing when it runs: logic errors, wrong conditions, off-by-one, unhandled empty, null or boundary input, error paths that lose or swallow errors, races, leaked resources, and wrong assumptions about the functions the change calls. Read the callers and callees, not only the diff.

Do not flag style, naming, or code the change did not touch unless the change makes it newly reachable.
