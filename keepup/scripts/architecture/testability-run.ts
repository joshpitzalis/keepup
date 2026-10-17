import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import type {
  ExistingTest,
  TestabilityAnalysis,
  TestabilityAssessmentInput,
  TestExecution,
} from "./testability.ts";

export function executeTest(root: string, test: ExistingTest): TestExecution {
  const escaped = test.name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

  const args = [
    "--test",
    "--test-reporter=tap",
    `--test-name-pattern=^${escaped}$`,
    test.file,
  ];

  const command = [process.execPath, ...args];

  const empty = {
    command,
    diagnostic: "Existing test file missing",
    exitCode: null,
    stderr: "",
    stdout: "",
    test,
  };

  const path = join(root, test.file);

  if (!existsSync(path) || !lstatSync(path).isFile()) {
    return { ...empty, status: "missing" };
  }

  const tracked = spawnSync(
    "git",
    ["ls-files", "--error-unmatch", "--", test.file],
    { cwd: root, encoding: "utf-8" }
  );

  if (
    tracked.status !== 0 ||
    test.file.startsWith(".keepup/") ||
    test.file.startsWith(".cogdebt/")
  ) {
    return {
      ...empty,
      diagnostic:
        "Existing tests must be tracked source outside learning state",
      status: "unavailable",
    };
  }

  const location = relative(root, realpathSync(path));

  if (location.startsWith("..") || isAbsolute(location)) {
    return {
      ...empty,
      diagnostic: "Test file escapes repository",
      status: "unavailable",
    };
  }

  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    maxBuffer: 2 * 1024 * 1024,
    timeout: 30_000,
  });

  const captured = {
    command,
    exitCode: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
    test,
  };

  if (result.error) {
    return {
      ...captured,
      diagnostic: result.error.message,
      status: "unavailable",
    };
  }

  const selected = result.stdout
    .split(/\r?\n/u)
    .filter((line) =>
      new RegExp(`^(?:not )?ok \\d+ - ${escaped}(?: #.*)?$`, "u").test(line)
    );

  const [line] = selected;

  if (selected.length !== 1 || !line) {
    return {
      ...captured,
      diagnostic:
        "Exact top-level Node test case not discovered; suite exit code is insufficient",
      status: "unavailable",
    };
  }

  if (/ # (?:SKIP|TODO)/u.test(line)) {
    return {
      ...captured,
      diagnostic: "Selected case skipped or pending",
      status: "skipped",
    };
  }

  if (result.status !== 0 || line.startsWith("not ok")) {
    return {
      ...captured,
      diagnostic: "Selected test failed",
      status: "failed",
    };
  }

  return {
    ...captured,
    diagnostic: "Exact selected top-level Node test passed",
    status: "passed",
  };
}

export function executeTestability(
  root: string,
  input: TestabilityAssessmentInput
): TestabilityAnalysis {
  return {
    environment: { node: process.version, platform: process.platform },
    kind: "testability",
    results: input.scenarios.map((scenario) => ({
      checks: scenario.tests.map((test) => executeTest(root, test)),
      compatibility: scenario.compatibility.map((test) =>
        executeTest(root, test)
      ),
      scenarioId: scenario.id,
    })),
  };
}
