import assert from "node:assert/strict";
import test from "node:test";

import { grade, pose } from "../scripts/question.ts";

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

test("grading resolves trimmed values and clamps confidence", () => {
  const result = pose(
    {
      correct: " Alpha ",
      options: [{ label: " Alpha " }, { label: " Beta ", value: " b " }],
    },
    () => 0.99
  );

  assert.equal(result.ok, true);

  if (!result.ok) {
    throw new Error("Expected posed question");
  }

  assert.deepEqual(
    grade(result.posed, { confidence: 120, values: [" Alpha "] }),
    {
      confidence: 100,
      correct: true,
      dontKnow: false,
      selected: [{ index: 1, label: "Alpha", value: "Alpha" }],
      unknownValues: [],
    }
  );
  assert.equal(
    grade(result.posed, { confidence: -5, values: ["b"] }).confidence,
    0
  );
  assert.equal(
    grade(result.posed, { confidence: 53.6, values: ["Alpha"] }).confidence,
    54
  );
  assert.equal(
    grade(result.posed, { confidence: 80, dontKnow: true, values: [] })
      .confidence,
    undefined
  );
  assert.deepEqual(grade(result.posed, { values: [" unknown "] }), {
    correct: false,
    dontKnow: false,
    selected: [],
    unknownValues: ["unknown"],
  });
});
