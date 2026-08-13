import assert from "node:assert/strict";
import test from "node:test";

import { computeLineResults, hasAnyElMillionMatch } from "./line-results.ts";

test("computes matches and El Millón independently for every line", () => {
  const results = computeLineResults([
    { lineIndex: 1, mainNumbers: [7, 9, 25], starNumbers: [4, 10], elMillionCode: "FCP68298" },
    { lineIndex: 2, mainNumbers: [14, 28, 33], starNumbers: [1, 11], elMillionCode: "FCP68299" },
  ], [7, 28], [10, 11], "FCP68299");

  assert.deepEqual(results, [
    { lineIndex: 1, matchesMain: 1, matchesStars: 1, elMillionMatch: false },
    { lineIndex: 2, matchesMain: 1, matchesStars: 1, elMillionMatch: true },
  ]);
  assert.equal(hasAnyElMillionMatch(results), true);
});

test("keeps legacy ticket-level code compatible when no line codes exist", () => {
  const results = computeLineResults(
    [{ lineIndex: 1, mainNumbers: [], starNumbers: [] }],
    [],
    [],
    "ABC12345",
    "ABC12345"
  );
  assert.equal(results[0]?.elMillionMatch, true);
});
