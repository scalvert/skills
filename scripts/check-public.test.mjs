import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "./check-public.mjs";

test("flags internal references", () => {
  const samples = [
    "see askscio/flywheel",
    "the scio repo",
    "ticket DEVPLAT-1447",
    "posted in C04ABCDE1234",
    "https://glean.slack.com/archives/x",
  ];
  for (const text of samples) assert.equal(scan(text).length, 1, text);
});

test("allows ordinary prose", () => {
  const samples = [
    "Glean is a company. See https://github.com/gleanwork/pluginpack.",
    "conscious science scion",
    "GHSA-2883-xcg3-v3hh and RFC-1234",
    "CHANGELOG and CONTRIBUTING",
  ];
  for (const text of samples) assert.deepEqual(scan(text), [], text);
});
