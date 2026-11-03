import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import type { CommandResults, Status, StoredEvent } from "../scripts/keepup.ts";
import type { Posed, Verdict } from "../scripts/question.ts";

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

for (const choice of [
  { correct: true, value: "forty-two" },
  { correct: false, value: "twenty-one" },
]) {
  test(`posed questions log ${choice.correct ? "correct" : "incorrect"} answers without changing quiz evidence`, (t) => {
    const root = fixture(t);

    const posed: { id: string; options: Posed["options"] } = JSON.parse(
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
      )
    );

    assert.deepEqual(Object.keys(posed).toSorted(), ["id", "options"]);
    assert.equal(posed.id, "question-1");
    assert.deepEqual(
      posed.options.toSorted((a, b) => a.value.localeCompare(b.value)),
      [
        { label: "Forty two", value: "forty-two" },
        { label: "Twenty one", value: "twenty-one" },
      ]
    );
    const answer = `  1 B — ${choice.value}  `;

    const verdict: Verdict = JSON.parse(
      run(
        root,
        "quiz",
        "answer",
        JSON.stringify({ answer, id: posed.id, values: [choice.value] })
      )
    );

    assert.equal(verdict.correct, choice.correct);
    assert.equal(readFileSync(join(root, ".keepup/events.jsonl"), "utf-8"), "");

    const event: StoredEvent = JSON.parse(
      run(
        root,
        "log",
        JSON.stringify({
          answers: [{ posed: posed.id }],
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

    assert.deepEqual(event.answers, [
      {
        answer,
        concept: "constant",
        correct: choice.correct,
        file: "answer.js",
        question: `What does answer contain?\nA. ${posed.options[0]?.label}\nB. ${posed.options[1]?.label}`,
      },
    ]);
    assert.deepEqual(Object.keys(event).toSorted(), [
      "answers",
      "files",
      "id",
      "phase",
      "retryDigest",
      "sha",
      "snapshots",
      "t",
      "type",
      "who",
    ]);
    const status: Status = JSON.parse(run(root, "status", "--json"));
    assert.equal(
      status.files.find((file) => file.file === "answer.js")?.accuracy,
      choice.correct ? 1 : 0
    );
    const legacyRoot = fixture(t);
    run(
      legacyRoot,
      "log",
      JSON.stringify({
        answers: event.answers,
        files: ["answer.js"],
        id: "legacy-quiz",
        phase: "pre",
        type: "quiz",
      })
    );

    const legacyStatus: Status = JSON.parse(
      run(legacyRoot, "status", "--json")
    );

    assert.equal(status.files[0]?.accuracy, legacyStatus.files[0]?.accuracy);
    assert.equal(status.files[0]?.mind, legacyStatus.files[0]?.mind);
    const health: CommandResults["health"] = JSON.parse(run(root, "health"));

    const legacyHealth: CommandResults["health"] = JSON.parse(
      run(legacyRoot, "health")
    );

    assert.equal(health.codeHealth, legacyHealth.codeHealth);
    assert.equal(health.comprehensionDebt, legacyHealth.comprehensionDebt);
    assert.deepEqual(health.dimensions, legacyHealth.dimensions);
  });
}
