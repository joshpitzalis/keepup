import assert from "node:assert/strict";
import test from "node:test";

import { pose } from "../scripts/question.ts";

test("posing preserves LearnHarness shuffle order for the same random sequence", () => {
  const options = ["A", "B", "C", "D"].map((label) => ({ label }));
  const draws = [0.1, 0.8, 0.4];

  const result = pose({ correct: "C", options }, () => {
    const draw = draws.shift();
    assert.notEqual(draw, undefined);

    return draw ?? 0;
  });

  assert.deepEqual(result, {
    ok: true,
    posed: {
      correctIndices: [3],
      options: [
        { label: "B", value: "B" },
        { label: "D", value: "D" },
        { label: "C", value: "C" },
        { label: "A", value: "A" },
      ],
    },
  });
  assert.deepEqual(options, [
    { label: "A" },
    { label: "B" },
    { label: "C" },
    { label: "D" },
  ]);
  assert.deepEqual(draws, []);
});
