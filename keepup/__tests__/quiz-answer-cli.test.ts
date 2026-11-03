import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import type { StoredEvent } from "../scripts/keepup.ts";
import type { Verdict } from "../scripts/question.ts";

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
  const root = realpathSync(mkdtempSync(join(tmpdir(), "keepup-quiz-answer-")));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  command(root, "git", "init", "-q");
  command(root, "git", "config", "user.email", "learner@example.com");
  command(root, "git", "config", "user.name", "Learner");
  writeFileSync(join(root, "answer.js"), "export const answer = 42;\n");
  command(root, "git", "add", "answer.js");
  run(root, "init");
  run(
    root,
    "quiz",
    "pose",
    JSON.stringify({
      concept: "constant",
      correct: "forty-two",
      file: "answer.js",
      id: "question-1",
      options: [
        { label: "Forty two", value: "forty-two" },
        { label: "Twenty one", value: "twenty-one" },
      ],
      stem: "What does answer contain?",
    })
  );

  return root;
}

test("dont know is an incorrect answer whose exact words become evidence", (t) => {
  const root = fixture(t);
  const answer = "  dont know\n";

  const verdict: Verdict = JSON.parse(
    run(
      root,
      "quiz",
      "answer",
      JSON.stringify({ answer, dontKnow: true, id: "question-1" })
    )
  );

  assert.deepEqual(verdict, {
    correct: false,
    dontKnow: true,
    selected: [],
    unknownValues: [],
  });

  assert.deepEqual(
    JSON.parse(
      run(
        root,
        "quiz",
        "answer",
        JSON.stringify({ answer, dontKnow: true, id: "question-1" })
      )
    ),
    verdict
  );

  const event: StoredEvent = JSON.parse(
    run(
      root,
      "log",
      JSON.stringify({
        answers: [{ posed: "question-1" }],
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

  assert.equal(event.answers[0]?.answer, answer);
  assert.equal(event.answers[0]?.correct, false);
});

test("answer retries return the verdict while changed answers are rejected", (t) => {
  const root = fixture(t);

  const input = {
    answer: "  1 B  ",
    id: "question-1",
    values: [" forty-two "],
  };

  const verdict: Verdict = JSON.parse(
    run(root, "quiz", "answer", JSON.stringify(input))
  );

  assert.equal(verdict.correct, true);
  assert.deepEqual(
    JSON.parse(run(root, "quiz", "answer", JSON.stringify(input))),
    verdict
  );

  for (const changed of [
    { ...input, answer: "B" },
    { ...input, values: ["twenty-one"] },
  ]) {
    const result = spawnSync(
      process.execPath,
      [cli, "quiz", "answer", JSON.stringify(changed)],
      { cwd: root, encoding: "utf-8" }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already answered.*different input/u);
  }

  assert.deepEqual(
    JSON.parse(run(root, "quiz", "answer", JSON.stringify(input))),
    verdict
  );
});

test("unknown selected values are reported and unknown question ids are rejected", (t) => {
  const root = fixture(t);

  const input = {
    answer: "another answer",
    id: "question-1",
    values: [" missing "],
  };

  const verdict: Verdict = JSON.parse(
    run(root, "quiz", "answer", JSON.stringify(input))
  );

  assert.deepEqual(verdict, {
    correct: false,
    dontKnow: false,
    selected: [],
    unknownValues: ["missing"],
  });
  assert.deepEqual(
    JSON.parse(run(root, "quiz", "answer", JSON.stringify(input))),
    verdict
  );

  const result = spawnSync(
    process.execPath,
    [cli, "quiz", "answer", JSON.stringify({ ...input, id: "absent" })],
    { cwd: root, encoding: "utf-8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown posed question/u);
});

test("invalid response shapes cannot consume a question", (t) => {
  const root = fixture(t);
  const input = { answer: "A", id: "question-1", values: ["forty-two"] };

  for (const response of [
    { ...input, dontKnow: "true" },
    { ...input, dontKnow: true },
    { ...input, values: [] },
    { ...input, values: ["forty-two", "twenty-one"] },
    { ...input, confidence: 80 },
    { ...input, correct: true },
  ]) {
    const result = spawnSync(
      process.execPath,
      [cli, "quiz", "answer", JSON.stringify(response)],
      { cwd: root, encoding: "utf-8" }
    );

    assert.notEqual(result.status, 0, JSON.stringify(response));
  }

  const verdict: Verdict = JSON.parse(
    run(root, "quiz", "answer", JSON.stringify(input))
  );

  assert.equal(verdict.correct, true);
  assert.equal(verdict.confidence, undefined);
});
