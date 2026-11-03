import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import type { StoredEvent } from "../scripts/keepup.ts";
import type { Posed } from "../scripts/question.ts";

const cli = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));

function command(root: string, executable: string, ...args: string[]) {
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr);

  return result.stdout;
}

function run(root: string, ...args: string[]) {
  return command(root, process.execPath, cli, ...args);
}

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "keepup-quiz-")));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  command(root, "git", "init", "-q");
  command(root, "git", "config", "user.email", "learner@example.com");
  command(root, "git", "config", "user.name", "Learner");
  writeFileSync(join(root, "answer.js"), "export const answer = 42;\n");
  command(root, "git", "add", "answer.js");
  run(root, "init");

  return root;
}

const spec = {
  concept: "constant",
  correct: "forty-two",
  file: "answer.js",
  id: "question-1",
  options: [
    { label: "Forty two", value: "forty-two" },
    { label: "Twenty one", value: "twenty-one" },
  ],
  stem: "What does answer contain?",
};

function rejected(root: string, payload: unknown, message: RegExp) {
  const result = spawnSync(
    process.execPath,
    [cli, "quiz", "pose", JSON.stringify(payload)],
    { cwd: root, encoding: "utf-8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, message);
}

test("pose rejects unequal whitespace-separated word counts and accepts a corrected question", (t) => {
  const root = fixture(t);
  rejected(
    root,
    {
      ...spec,
      options: [
        { label: "Forty two", value: "forty-two" },
        { label: "Twenty", value: "twenty-one" },
      ],
    },
    /equal.*word count/iu
  );
  run(
    root,
    "quiz",
    "pose",
    JSON.stringify({
      ...spec,
      options: [
        { label: "  Forty\t two  ", value: "forty-two" },
        { label: "Twenty\n one", value: "twenty-one" },
      ],
    })
  );
});

test("pose rejects multi-select without storing a question", (t) => {
  const root = fixture(t);
  rejected(root, { ...spec, multiSelect: true }, /multi-select/iu);
  run(root, "quiz", "pose", JSON.stringify(spec));
});

test("pose reports duplicate values and an unmatched answer key separately", (t) => {
  const root = fixture(t);
  rejected(
    root,
    {
      ...spec,
      options: [
        { label: "Forty two", value: " forty-two " },
        { label: "Twenty one", value: "forty-two" },
      ],
    },
    /duplicate option values/iu
  );
  rejected(root, { ...spec, correct: "missing" }, /answer key must match/iu);
  run(root, "quiz", "pose", JSON.stringify(spec));
});

test("identical pose retries preserve the display order and an already recorded answer", (t) => {
  const root = fixture(t);
  const posed = run(root, "quiz", "pose", JSON.stringify(spec));
  assert.equal(run(root, "quiz", "pose", JSON.stringify(spec)), posed);
  run(
    root,
    "quiz",
    "answer",
    JSON.stringify({ answer: "forty two", id: spec.id, values: ["forty-two"] })
  );
  assert.equal(run(root, "quiz", "pose", JSON.stringify(spec)), posed);

  const event: StoredEvent = JSON.parse(
    run(
      root,
      "log",
      JSON.stringify({
        answers: [{ posed: spec.id }],
        files: ["answer.js"],
        id: "quiz-1",
        phase: "pre",
        type: "quiz",
      })
    )
  );

  assert.equal(event.type, "quiz");

  if (event.type !== "quiz") {
    throw new Error("Expected quiz event");
  }

  assert.equal(event.answers[0].answer, "forty two");
  assert.equal(event.answers[0].correct, true);
});

test("pose rejects changed metadata, options, keys and unsupported fields for an existing id", (t) => {
  const root = fixture(t);
  const posed = run(root, "quiz", "pose", JSON.stringify(spec));

  for (const change of [
    { stem: "Another question?" },
    { file: "different.js" },
    { concept: "different" },
    { correct: "twenty-one" },
    { correct: ["forty-two"] },
    { multiSelect: false },
    { options: spec.options.toReversed() },
    {
      options: [{ label: "Forty two", value: " forty-two " }, spec.options[1]],
    },
  ]) {
    rejected(root, { ...spec, ...change }, /different input/iu);
  }

  rejected(root, { ...spec, extra: true }, /unsupported.*field/iu);
  rejected(
    root,
    {
      ...spec,
      options: [{ ...spec.options[0], extra: true }, spec.options[1]],
    },
    /unsupported.*field/iu
  );
  assert.equal(run(root, "quiz", "pose", JSON.stringify(spec)), posed);
});

test("pose accepts a blank optional value and resolves it to the trimmed label", (t) => {
  const root = fixture(t);

  const posed: { id: string; options: Posed["options"] } = JSON.parse(
    run(
      root,
      "quiz",
      "pose",
      JSON.stringify({
        ...spec,
        correct: "Forty two",
        options: [
          { label: "  Forty two  ", value: " " },
          { label: "Twenty one" },
        ],
      })
    )
  );

  assert.deepEqual(
    posed.options.toSorted((a, b) => a.label.localeCompare(b.label)),
    [
      { label: "Forty two", value: "Forty two" },
      { label: "Twenty one", value: "Twenty one" },
    ]
  );
});
