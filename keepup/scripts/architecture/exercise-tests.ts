import { spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";

import type { ExerciseTestRun } from "./exercise-domain.ts";
import { executeTest } from "./testability-run.ts";
import type { ExistingTest } from "./testability.ts";

export function suiteFiles(
  root: string,
  command: string,
  required: readonly ExistingTest[]
): readonly string[] {
  const [executable, flag, reporter, ...files] = command.trim().split(/\s+/u);

  if (
    (executable !== "node" && executable !== process.execPath) ||
    flag !== "--test" ||
    reporter !== "--test-reporter=tap" ||
    !files.length ||
    !required.length
  ) {
    throw new Error(
      "Exercise test command unavailable: initial support requires the existing explicit node --test --test-reporter=tap <tracked files> suite and named required behaviour checks; wrappers, filters and trivial commands cannot prove a complete run"
    );
  }

  for (const file of files) {
    const tracked = spawnSync(
      "git",
      ["ls-files", "--error-unmatch", "--", file],
      { cwd: root, encoding: "utf-8" }
    );

    if (
      !/^[a-zA-Z0-9_./-]+$/u.test(file) ||
      file.startsWith("-") ||
      isAbsolute(file) ||
      file.split("/").includes("..") ||
      file.startsWith(".keepup/") ||
      file.startsWith(".cogdebt/") ||
      tracked.status !== 0 ||
      !existsSync(join(root, file)) ||
      !lstatSync(join(root, file)).isFile()
    ) {
      throw new Error(
        "Exercise test command requires explicit tracked regular source test files; globs, shell syntax and generated learning-state files are unsupported"
      );
    }
  }

  if (
    required.some(
      (test) =>
        !files.includes(test.file) ||
        test.name === test.file ||
        test.name === basename(test.file)
    )
  ) {
    throw new Error(
      "Exercise test command must include every required named behavioural case; a file fallback is not a test case"
    );
  }

  return files;
}

function tapCount(stdout: string, label: string): number {
  const matches = [
    ...stdout.matchAll(new RegExp(`^# ${label} (\\d+)$`, "gmu")),
  ];

  const value = matches[0]?.[1];

  if (matches.length !== 1 || value === undefined) {
    throw new Error(
      "Existing exercise test command did not emit complete unambiguous Node TAP counts"
    );
  }

  return Number(value);
}

export function runExerciseTests(
  root: string,
  command: string,
  required: readonly ExistingTest[]
): ExerciseTestRun {
  const files = suiteFiles(root, command, required);
  const [executable] = command.trim().split(/\s+/u);

  if (!executable) {
    throw new Error("Missing existing test executable");
  }

  const result = spawnSync(
    executable,
    ["--test", "--test-reporter=tap", ...files],
    {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, NODE_TEST_CONTEXT: undefined },
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    }
  );

  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `Existing exercise test command did not complete successfully (${result.signal ?? result.status ?? result.error?.message}): ${result.stderr || result.stdout}`
    );
  }

  const tests = tapCount(result.stdout, "tests");
  const passed = tapCount(result.stdout, "pass");

  const incomplete = ["fail", "cancelled", "skipped", "todo"].some(
    (label) => tapCount(result.stdout, label) !== 0
  );

  if (
    !/^TAP version 13$/mu.test(result.stdout) ||
    !/^1\.\.[1-9]\d*$/mu.test(result.stdout) ||
    tests <= 0 ||
    passed !== tests ||
    incomplete
  ) {
    throw new Error(
      "Existing exercise test command has zero, failed, skipped, cancelled, pending or incomplete behavioural checks"
    );
  }

  const witnesses = required.map((test) => executeTest(root, test));

  if (witnesses.some((witness) => witness.status !== "passed")) {
    throw new Error(
      "Existing exercise test command lacks a complete required file/name witness; selected cases cannot be absent, skipped or replaced by another file's identically named test"
    );
  }

  return {
    command,
    exitCode: 0,
    stderr: result.stderr,
    stdout: result.stdout,
    tests,
    witnesses,
  };
}
