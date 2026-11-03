import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import type { StoredEvent } from "../scripts/keepup.ts";

interface LogInput {
  id: string;
  type: string;
  phase: string;
  files: readonly string[];
  answers: readonly (
    | { posed: string; correct?: boolean }
    | {
        file: string;
        concept: string;
        question: string;
        answer: string;
        correct: boolean;
      }
  )[];
}

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
  const root = realpathSync(mkdtempSync(join(tmpdir(), "keepup-quiz-log-")));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  command(root, "git", "init", "-q");
  command(root, "git", "config", "user.email", "learner@example.com");
  command(root, "git", "config", "user.name", "Learner");
  writeFileSync(join(root, "answer.js"), "export const answer = 42;\n");
  writeFileSync(join(root, "other.js"), "export const other = 21;\n");
  command(root, "git", "add", "answer.js", "other.js");
  run(root, "init");

  return root;
}

function pose(root: string, id: string) {
  run(
    root,
    "quiz",
    "pose",
    JSON.stringify({
      concept: "constant",
      correct: "right",
      file: "answer.js",
      id,
      options: [
        { label: "Forty two", value: "right" },
        { label: "Twenty one", value: "wrong" },
      ],
      stem: "What is answer?",
    })
  );
}

function answer(root: string, id: string) {
  run(
    root,
    "quiz",
    "answer",
    JSON.stringify({ answer: "the first one", id, values: ["right"] })
  );
}

function quiz(id: string, posed: string) {
  return {
    answers: [{ posed }],
    files: ["answer.js"],
    id,
    phase: "pre",
    type: "quiz",
  };
}

function rejects(root: string, input: LogInput, pattern: RegExp) {
  const result = spawnSync(
    process.execPath,
    [cli, "log", JSON.stringify(input)],
    { cwd: root, encoding: "utf-8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, pattern);
}

test("a posed answer can be retried but cannot earn credit in another event or learner", (t) => {
  const root = fixture(t);
  pose(root, "question");
  answer(root, "question");
  const input = quiz("first", "question");
  const accepted = run(root, "log", JSON.stringify(input));
  assert.equal(run(root, "log", JSON.stringify(input)), accepted);
  rejects(root, quiz("second", "question"), /already.*(?:used|logged)/iu);
  command(root, "git", "config", "user.email", "other@example.com");
  rejects(root, input, /already.*(?:used|logged)/iu);
});

test("rejected references and invalid quiz events leave answers available", (t) => {
  const root = fixture(t);
  rejects(root, quiz("missing", "unknown"), /Unknown posed question/u);
  pose(root, "question");
  rejects(root, quiz("unanswered", "question"), /not been answered/u);
  answer(root, "question");
  const input = quiz("accepted", "question");
  rejects(root, { ...input, files: ["other.js"] }, /Invalid quiz answer/u);
  rejects(
    root,
    { ...input, answers: [{ posed: "question" }, { posed: "question" }] },
    /only appear once/u
  );
  rejects(
    root,
    { ...input, answers: [{ correct: true, posed: "question" }] },
    /only accept the posed id/u
  );
  rejects(root, { ...input, phase: "check" }, /No delayed check is due/u);
  rejects(
    root,
    {
      ...input,
      answers: [
        { posed: "question" },
        {
          answer: "42",
          concept: "constant",
          correct: true,
          file: "answer.js",
          question: "Recall answer",
        },
      ],
      phase: "check",
    },
    /exactly one answer about one file/u
  );
  assert.match(run(root, "log", JSON.stringify(input)), /"correct":true/u);
});

test("mixed and legacy answers retain their shape while retries retain their references", (t) => {
  const root = fixture(t);
  pose(root, "logs");
  answer(root, "logs");

  const recalled = {
    answer: "21",
    concept: "constant",
    correct: true,
    file: "other.js",
    question: "Recall other",
  };

  const input = {
    ...quiz("mixed", "logs"),
    answers: [{ posed: "logs" }, recalled],
    files: ["answer.js", "other.js"],
  };

  const serialized = run(root, "log", JSON.stringify(input));
  const event: StoredEvent = JSON.parse(serialized);
  assert.equal(event.type, "quiz");

  if (event.type !== "quiz") {
    throw new Error("Expected quiz event");
  }

  assert.deepEqual(event.answers[1], recalled);
  assert.equal(run(root, "log", JSON.stringify(input)), serialized);
  rejects(
    root,
    { ...input, answers: event.answers },
    /different posed references/u
  );

  const legacy = {
    answers: [recalled],
    files: ["other.js"],
    id: "legacy",
    phase: "pre",
    type: "quiz",
  };

  const old: StoredEvent = JSON.parse(run(root, "log", JSON.stringify(legacy)));
  assert.equal(old.type, "quiz");

  if (old.type !== "quiz") {
    throw new Error("Expected quiz event");
  }

  assert.deepEqual(old.answers, [recalled]);
  assert.deepEqual(JSON.parse(run(root, "log", JSON.stringify(legacy))), old);
  run(root, "status", "--json");
});

function logConcurrently(root: string, input: LogInput) {
  // oxlint-disable-next-line promise/avoid-new -- Observe competing real CLI subprocesses without mocking the shared lock.
  return new Promise<{ status: number | null; stderr: string }>(
    (resolve, reject) => {
      const process = spawn(
        globalThis.process.execPath,
        [cli, "log", JSON.stringify(input)],
        { cwd: root }
      );

      let stderr = "";
      process.stderr.setEncoding("utf-8");
      process.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      process.stdout.resume();
      process.on("error", reject);
      process.on("close", (status) => resolve({ status, stderr }));
    }
  );
}

test("concurrent log calls can consume one posed answer only once", async (t) => {
  const root = fixture(t);
  pose(root, "question");
  answer(root, "question");

  const results = await Promise.all([
    logConcurrently(root, quiz("first", "question")),
    logConcurrently(root, quiz("second", "question")),
  ]);

  assert.deepEqual(results.map((result) => result.status).toSorted(), [0, 1]);
  assert.match(
    results.find((result) => result.status === 1)?.stderr ?? "",
    /already logged/u
  );
});
