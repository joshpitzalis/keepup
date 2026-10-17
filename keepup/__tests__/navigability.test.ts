import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import type { NavigabilityAssessmentInput } from "../scripts/architecture/navigability.ts";

const CLI = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));

test("navigability records exact comprehension question and necessary reviewed module transitions", (t) => {
  const root = mkdtempSync(join(tmpdir(), "navigability-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  for (const name of ["orders.ts", "pass-through.ts", "storage.ts"]) {
    writeFileSync(join(root, name), "export const save = () => 1;\n");
  }

  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);

  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      cwd: root,
      encoding: "utf-8",
    });

    assert.equal(result.status, 0, result.stderr);

    return JSON.parse(result.stdout);
  };

  run("init");

  const result = run(
    "architecture",
    "record",
    JSON.stringify({
      dimension: "navigability",
      evidence: [],
      exclusions: [],
      id: "baseline",
      limitations: [],
      module: {
        id: "orders",
        interface: ["orders.ts"],
        members: ["orders.ts"],
      },
      questions: [
        {
          disagreements: [],
          evidence: ["orders.ts"],
          id: "save",
          namingIssues: [],
          owningModule: "orders",
          question: "What happens when saving an order fails?",
          readability: "coherent",
          readabilityExplanation:
            "The implementation keeps one behaviour under a clear owner",
          trail: [
            {
              file: "pass-through.ts",
              id: "dispatch",
              kind: "implementation",
              location: "line 1",
              moduleId: "dispatch",
              necessary: true,
              reason: "Must inspect dispatch to discover failure path",
            },
            {
              file: "storage.ts",
              id: "storage",
              kind: "implementation",
              location: "line 1",
              moduleId: "storage",
              necessary: true,
              reason: "Must inspect storage error translation",
            },
          ],
          trailStatus: "complete",
        },
      ],
      review: {
        confidence: "medium",
        notes: "Reviewed sufficient trail",
        reviewer: "Learner",
        status: "reviewed",
      },
    })
  );

  assert.equal(result.measurements.transitions, 2);
  assert.equal(result.measurements.value, 1 / 3);
  assert.equal(
    result.measurements.questions[0].question,
    "What happens when saving an order fails?"
  );
});

function fixture(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "navigation-cases-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  for (const name of ["orders.ts", "pass-through.ts", "storage.ts"]) {
    writeFileSync(join(root, name), "export const save = () => 1;\n");
  }

  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);
  cliRun(root, CLI, "init");

  return root;
}

function cliRun(root: string, cli: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

function input(id: string): NavigabilityAssessmentInput {
  return {
    dimension: "navigability",
    evidence: [],
    exclusions: [],
    id,
    limitations: [],
    module: { id: "orders", interface: ["orders.ts"], members: ["orders.ts"] },
    questions: [
      {
        disagreements: [],
        evidence: ["orders.ts"],
        id: "save",
        namingIssues: [],
        owningModule: "orders",
        question: "What happens when saving an order fails?",
        readability: "coherent",
        readabilityExplanation:
          "The implementation keeps one behaviour under a clear owner",
        trail: [
          {
            file: "pass-through.ts",
            id: "dispatch",
            kind: "implementation",
            location: "line 1",
            moduleId: "dispatch",
            necessary: true,
            reason: "Must inspect dispatch to discover failure path",
          },
          {
            file: "storage.ts",
            id: "storage",
            kind: "implementation",
            location: "line 1",
            moduleId: "storage",
            necessary: true,
            reason: "Must inspect storage error translation",
          },
        ],
        trailStatus: "complete",
      },
    ],
    review: {
      confidence: "medium",
      notes: "Reviewed sufficient trail",
      reviewer: "Learner",
      status: "reviewed",
    },
  };
}

function record(root: string, value: NavigabilityAssessmentInput, cli = CLI) {
  return cliRun(root, cli, "architecture", "record", JSON.stringify(value));
}

test("incomplete, unresolved and ambiguous trails keep observed raw counts without claiming smaller navigation scores", (t) => {
  const root = fixture(t);
  const source = input("before");
  const [question] = source.questions;
  assert.ok(question);

  for (const value of [
    {
      ...source,
      id: "incomplete",
      questions: [{ ...question, trail: [], trailStatus: "incomplete" }],
    },
    {
      ...source,
      id: "unresolved",
      questions: [{ ...question, trailStatus: "unresolved" }],
    },
    {
      ...source,
      id: "owner",
      questions: [{ ...question, owningModule: null }],
    },
    {
      ...source,
      id: "attribution",
      questions: [
        {
          ...question,
          trail: question.trail.map((step) => ({ ...step, moduleId: null })),
        },
      ],
    },
    { ...source, id: "empty", questions: [] },
  ] satisfies readonly NavigabilityAssessmentInput[]) {
    const result = record(root, value);
    assert.equal(result.measurements.status, "unavailable");
    assert.equal(result.measurements.value, null);
    assert.equal(result.measurements.transitions, null);
    assert.ok(result.limitations.length);
  }

  const provisional = record(root, {
    ...source,
    id: "proposal",
    questions: [
      {
        ...question,
        disagreements: [
          "Reviewer questions whether storage inspection is necessary",
        ],
        namingIssues: [
          "Save means persist in one module and dispatch in another",
        ],
      },
    ],
    review: { ...source.review, status: "provisional" },
  });

  assert.equal(provisional.input.review.status, "provisional");
  assert.match(provisional.limitations.join(" "), /domain naming issue/u);
  assert.match(provisional.limitations.join(" "), /reviewer disagreement/u);
});

test("calibration rewards removed pass-throughs, ignores hidden private helpers and rejects giant-file concealment", (t) => {
  const root = fixture(t);
  const source = input("before");
  const [question] = source.questions;
  assert.ok(question);

  const checkBehaviour = () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import assert from 'node:assert/strict'; import { save } from './orders.ts'; assert.equal(save(), 'unavailable'); assert.equal(save(false), 'saved');",
      ],
      { cwd: root, encoding: "utf-8" }
    );

    assert.equal(result.status, 0, result.stderr);
  };

  const handleFailure =
    "export const save = (fail = true) => { try { return persist(fail); } catch { return 'unavailable'; } };\n";

  writeFileSync(
    join(root, "storage.ts"),
    "export const persist = (fail) => { if (fail) throw new Error('offline'); return 'saved'; };\n"
  );
  writeFileSync(
    join(root, "pass-through.ts"),
    "export { persist } from './storage.ts';\n"
  );
  writeFileSync(
    join(root, "orders.ts"),
    `import { persist } from './pass-through.ts';\n${handleFailure}`
  );
  checkBehaviour();
  const before = record(root, source);
  assert.equal(before.measurements.transitions, 2);
  writeFileSync(
    join(root, "orders.ts"),
    `import { persist } from './storage.ts';\n${handleFailure}`
  );
  checkBehaviour();

  const improved = record(root, {
    ...source,
    id: "improved",
    questions: [
      {
        ...question,
        trail: question.trail.filter((step) => step.id !== "dispatch"),
      },
    ],
  });

  assert.equal(improved.measurements.transitions, 1);
  assert.equal(improved.measurements.value, 0.5);

  writeFileSync(
    join(root, "orders.ts"),
    `import { persist } from './pass-through.ts';\nfunction normalise(value) { return value; }\n${handleFailure.replace(
      "return persist(fail)",
      "return normalise(persist(fail))"
    )}`
  );
  checkBehaviour();

  const withPrivate = record(root, {
    ...source,
    id: "private",
    questions: [
      {
        ...question,
        trail: [
          ...question.trail,
          {
            file: "orders.ts",
            id: "helper",
            kind: "private-helper",
            location: "line 1",
            moduleId: "orders",
            necessary: false,
            reason:
              "Hidden helper need not be inspected to answer the caller question",
          },
        ],
      },
    ],
  });

  assert.equal(withPrivate.measurements.value, before.measurements.value);

  writeFileSync(
    join(root, "orders.ts"),
    `${Array.from(
      { length: 200 },
      (_, index) => `const unrelatedPolicy${index} = ${index};`
    ).join(
      "\n"
    )}\nconst persist = (fail) => { if (fail) throw new Error('offline'); return 'saved'; };\n${
      handleFailure
    }`
  );
  checkBehaviour();

  const concealed = record(root, {
    ...source,
    id: "concealed",
    questions: [
      {
        ...question,
        readability: "consolidation-obscures",
        readabilityExplanation:
          "Giant file hides unrelated policies and obscures failure ownership",
        trail: [
          {
            file: "orders.ts",
            id: "giant",
            kind: "implementation",
            location: "line 1",
            moduleId: "orders",
            necessary: true,
            reason: "All code merged into a giant file",
          },
        ],
      },
    ],
  });

  assert.equal(concealed.measurements.questions[0].observedTransitions, 0);
  assert.equal(concealed.measurements.value, null);
  assert.match(concealed.limitations.join(" "), /consolidation-obscures/u);

  const comparison = cliRun(
    root,
    CLI,
    "architecture",
    "compare",
    "before",
    "improved",
    "--json"
  );

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.changes.transitions, -1);
  record(root, {
    ...source,
    id: "changed-question",
    questions: [
      { ...question, question: "What happens on a successful save?" },
    ],
  });
  assert.equal(
    cliRun(
      root,
      CLI,
      "architecture",
      "compare",
      "before",
      "changed-question",
      "--json"
    ).comparable,
    false
  );
  assert.equal(
    cliRun(
      root,
      CLI,
      "architecture",
      "compare",
      "before",
      "concealed",
      "--json"
    ).comparable,
    false
  );
});

test("copied installation retains shared evidence, freshness and report facts without learning credit", (t) => {
  const root = fixture(t);
  const installed = join(root, "copied-skill");
  cpSync(dirname(dirname(CLI)), installed, { recursive: true });
  const cli = join(installed, "scripts/keepup.mjs");
  const source = input("copied");
  const [question] = source.questions;
  assert.ok(question);

  const value = {
    ...source,
    questions: [
      question,
      {
        ...question,
        id: "retry",
        question: "Which failures are safe to retry?",
      },
    ],
  };

  const original = record(root, value, cli);
  assert.equal(original.measurements.denominator, 2);
  assert.equal(original.measurements.transitions, 4);
  assert.equal(
    cliRun(root, cli, "architecture", "inspect", "copied", "--json").freshness
      .status,
    "current"
  );

  const report = cliRun(
    root,
    cli,
    "architecture",
    "report",
    "copied",
    "--no-open"
  );

  const html = readFileSync(report.path, "utf-8");
  assert.match(html, /What happens when saving an order fails\?/u);
  assert.match(html, /Necessary external implementation transitions: 4/u);
  writeFileSync(join(root, "storage.ts"), "export const changed = true;\n");

  const stale = cliRun(
    root,
    cli,
    "architecture",
    "inspect",
    "copied",
    "--json"
  );

  assert.equal(stale.freshness.status, "stale");
  assert.deepEqual(stale.assessment, original);
  assert.deepEqual(record(root, value, cli), original);
  assert.equal(readFileSync(join(root, ".keepup/events.jsonl"), "utf-8"), "");
  assert.equal(readFileSync(join(root, ".keepup/history.jsonl"), "utf-8"), "");
});
