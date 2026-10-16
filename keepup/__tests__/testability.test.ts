import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import type { TestabilityAssessmentInput } from "../scripts/architecture/testability.ts";

const CLI = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));

test("testability executes a selected existing test and records reviewed observable outcomes", (t) => {
  const root = mkdtempSync(join(tmpdir(), "testability-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "module.mjs"), "export const total = () => 42;\n");
  writeFileSync(
    join(root, "existing.test.mjs"),
    "import test from 'node:test'; import assert from 'node:assert/strict'; import {total} from './module.mjs'; test('total outcome', () => assert.equal(total(),42));\n"
  );
  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);

  run(root, CLI, "init");

  const result = run(
    root,
    CLI,
    "architecture",
    "testability",
    JSON.stringify({
      dimension: "behavioural-testability",
      discovery: "complete",
      environmentRequirements: ["Node >=24"],
      evidence: [],
      exclusions: [],
      id: "baseline",
      limitations: [],
      module: {
        id: "totals",
        interface: ["module.mjs"],
        members: ["module.mjs"],
      },
      review: {
        confidence: "medium",
        notes: "Observed intended interface and outcome",
        reviewer: "Learner",
        status: "reviewed",
      },
      scenarios: [
        {
          assertion: {
            evidence: ["existing.test.mjs"],
            explanation: "Asserts returned total through module export",
            kind: "observable-outcome",
            status: "reviewed",
            throughInterface: true,
          },
          behaviour: "Calculate total",
          compatibility: [],
          dependency: {
            compatibilityRequired: false,
            justification: "No external dependencies",
            kind: "pure",
          },
          failureInvariant: "Reject invalid totals",
          id: "total",
          intendedInterface: "module.mjs",
          tests: [{ file: "existing.test.mjs", name: "total outcome" }],
        },
      ],
    })
  );

  assert.equal(
    result.measurements.qualifying,
    1,
    JSON.stringify(result.analysis)
  );
  assert.equal(result.measurements.value, 1);
  assert.equal(result.analysis.results[0].checks[0].status, "passed");
});

function fixture(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "testability-cases-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "module.mjs"), "export const total = () => 42;\n");
  writeFileSync(
    join(root, "existing.test.mjs"),
    "import test from 'node:test'; import assert from 'node:assert/strict'; import {writeFileSync} from 'node:fs'; import {total} from './module.mjs'; test('total outcome', () => assert.equal(total(),42)); test('failed outcome', () => assert.equal(total(),0)); test.skip('skipped outcome', () => {}); test('mutating outcome', () => writeFileSync(new URL('./module.mjs',import.meta.url),'export const total = () => 43;'));\n"
  );
  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);
  run(root, CLI, "init");

  return root;
}

function run(root: string, cli: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

function input(id: string): TestabilityAssessmentInput {
  return {
    dimension: "behavioural-testability",
    discovery: "complete",
    environmentRequirements: ["Node >=24"],
    evidence: [],
    exclusions: [],
    id,
    limitations: [],
    module: {
      id: "totals",
      interface: ["module.mjs"],
      members: ["module.mjs"],
    },
    review: {
      confidence: "medium",
      notes: "Observed intended interface and outcome",
      reviewer: "Learner",
      status: "reviewed",
    },
    scenarios: [
      {
        assertion: {
          evidence: ["existing.test.mjs"],
          explanation: "Asserts returned total through module export",
          kind: "observable-outcome",
          status: "reviewed",
          throughInterface: true,
        },
        behaviour: "Calculate total",
        compatibility: [],
        dependency: {
          compatibilityRequired: false,
          justification: "No external dependencies",
          kind: "pure",
        },
        failureInvariant: "Reject invalid totals",
        id: "total",
        intendedInterface: "module.mjs",
        tests: [{ file: "existing.test.mjs", name: "total outcome" }],
      },
    ],
  };
}

function assess(root: string, value: TestabilityAssessmentInput, cli = CLI) {
  return run(root, cli, "architecture", "testability", JSON.stringify(value));
}

test("known gaps, failures, skipped cases, missing tests and incomplete discovery remain distinct", (t) => {
  const root = fixture(t);
  const source = input("cases");
  const [scenario] = source.scenarios;
  assert.ok(scenario);

  const result = assess(root, {
    ...source,
    scenarios: [
      { ...scenario, id: "pass" },
      { ...scenario, id: "gap", tests: [] },
      {
        ...scenario,
        id: "failed",
        tests: [{ file: "existing.test.mjs", name: "failed outcome" }],
      },
      {
        ...scenario,
        id: "skipped",
        tests: [{ file: "existing.test.mjs", name: "skipped outcome" }],
      },
      {
        ...scenario,
        id: "unavailable",
        tests: [{ file: "existing.test.mjs", name: "undiscovered case" }],
      },
      {
        ...scenario,
        id: "missing",
        tests: [{ file: "deleted.test.mjs", name: "total outcome" }],
      },
    ],
  });

  assert.deepEqual(
    result.measurements.scenarios.map(
      (entry: { status: string }) => entry.status
    ),
    ["qualifying", "gap", "failed", "skipped", "unavailable", "gap"]
  );
  assert.equal(result.measurements.qualifying, 1);
  assert.equal(result.measurements.denominator, 6);
  assert.equal(result.measurements.value, null);

  const incomplete = assess(root, {
    ...input("incomplete"),
    discovery: "incomplete",
  });

  assert.equal(incomplete.measurements.value, null);
  const empty = assess(root, { ...input("empty"), scenarios: [] });
  assert.equal(empty.measurements.value, null);

  const wholeSuiteOnly = assess(root, {
    ...input("whole-suite"),
    scenarios: [
      {
        ...scenario,
        tests: [
          {
            file: "existing.test.mjs",
            name: "a case not proven by suite exit zero",
          },
        ],
      },
    ],
  });

  assert.equal(wholeSuiteOnly.measurements.scenarios[0].status, "unavailable");
});

test("dependency strategies retain production compatibility and mock interaction assertions do not qualify", (t) => {
  const root = fixture(t);
  const source = input("strategies");
  const [scenario] = source.scenarios;
  assert.ok(scenario);

  const strategies = [
    "pure",
    "local-substitute",
    "owned-remote",
    "true-external",
  ] as const;

  const result = assess(root, {
    ...source,
    scenarios: strategies.map((kind) => ({
      ...scenario,
      compatibility:
        kind === "pure" || kind === "local-substitute"
          ? []
          : [{ file: "existing.test.mjs", name: "total outcome" }],
      dependency: { ...scenario.dependency, kind },
      id: kind,
    })),
  });

  assert.equal(result.measurements.qualifying, 4);

  const remoteGap = assess(root, {
    ...input("remote-gap"),
    scenarios: [
      {
        ...scenario,
        compatibility: [],
        dependency: { ...scenario.dependency, kind: "owned-remote" },
      },
    ],
  });

  assert.equal(remoteGap.measurements.value, 0);
  assert.match(remoteGap.measurements.scenarios[0].reason, /compatibility/u);

  const interactions = assess(root, {
    ...input("interactions"),
    scenarios: [
      {
        ...scenario,
        assertion: { ...scenario.assertion, kind: "interaction-only" },
      },
    ],
  });

  assert.equal(interactions.measurements.qualifying, 0);

  const privateHelper = assess(root, {
    ...input("helper"),
    scenarios: [
      {
        ...scenario,
        assertion: { ...scenario.assertion, throughInterface: false },
      },
    ],
  });

  assert.equal(privateHelper.measurements.qualifying, 0);
});

test("execution is immutable, inspection never reruns, source mutation aborts and untrusted execution metadata is rejected", (t) => {
  const root = fixture(t);
  const source = input("frozen");
  const original = assess(root, source);
  writeFileSync(
    join(root, "existing.test.mjs"),
    "throw new Error('inspection must not execute me');\n"
  );
  assert.deepEqual(assess(root, source), original);

  const inspected = run(
    root,
    CLI,
    "architecture",
    "inspect",
    "frozen",
    "--json"
  );

  assert.equal(inspected.freshness.status, "stale");
  assert.deepEqual(inspected.assessment, original);

  const forged = spawnSync(
    process.execPath,
    [
      CLI,
      "architecture",
      "testability",
      JSON.stringify({ ...input("forged"), analysis: original.analysis }),
    ],
    { cwd: root }
  );

  assert.equal(forged.status, 1);
  const mutationRoot = fixture(t);
  const mutation = input("mutation");

  const result = spawnSync(
    process.execPath,
    [
      CLI,
      "architecture",
      "testability",
      JSON.stringify({
        ...mutation,
        scenarios: mutation.scenarios.map((scenario) => ({
          ...scenario,
          tests: [{ file: "existing.test.mjs", name: "mutating outcome" }],
        })),
      }),
    ],
    { cwd: mutationRoot, encoding: "utf-8" }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Source changed/u);
  assert.deepEqual(run(mutationRoot, CLI, "architecture", "list"), []);
});
