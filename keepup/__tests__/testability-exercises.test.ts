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

import type { ExerciseGuardrail } from "../scripts/architecture/exercise-domain.ts";
import type {
  ExistingTest,
  TestabilityAssessmentInput,
} from "../scripts/architecture/testability.ts";

const CLI = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));

const original =
  "export const total=(value:number)=>{if(value<0)throw new Error('negative');return value*2;};\n";

const scaffold = "// Learner will verify the total contract.\n";

const authored =
  "import test from 'node:test'; import assert from 'node:assert/strict'; import {total} from './module.ts'; test('positive total',()=>assert.equal(total(3),6)); test('negative rejected',()=>assert.throws(()=>total(-1),/negative/u));\n";

const positive = { file: "scenario.test.ts", name: "positive total" };
const negative = { file: "scenario.test.ts", name: "negative rejected" };

const concepts = ["public total", "invalid input", "outcome assertion"].map(
  (concept) => ({ concept, file: "scenario.test.ts" })
);

function command(root: string, cli: string, ...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      KEEPUP_ANALYSER_DIRECTORY: process.env.KEEPUP_TEST_ANALYSER_DIRECTORY,
    },
  });
}

function run(root: string, cli: string, ...args: string[]) {
  const result = command(root, cli, ...args);
  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

function definition(id: string, complete = false): TestabilityAssessmentInput {
  return {
    dimension: "behavioural-testability",
    discovery: "complete",
    environmentRequirements: [],
    evidence: ["module.ts"],
    exclusions: [],
    id,
    limitations: ["Seam safety unmeasured"],
    module: {
      id: "totals",
      interface: ["module.ts"],
      members: ["module.ts", "scenario.test.ts"],
    },
    review: {
      confidence: "high",
      notes: "Actual public total source",
      reviewer: "Fixture reviewer",
      status: "reviewed",
    },
    scenarios: [
      {
        assertion: {
          evidence: ["scenario.test.ts"],
          explanation:
            "Positive result and negative rejection through exported total",
          kind: "observable-outcome",
          status: "reviewed",
          throughInterface: true,
        },
        behaviour: "Return doubled positive totals",
        compatibility: [],
        dependency: {
          compatibilityRequired: false,
          justification: "No external dependency",
          kind: "pure",
        },
        failureInvariant: "Negative input throws",
        id: "total",
        intendedInterface: "module.ts",
        tests: complete ? [positive, negative] : [],
      },
    ],
  };
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "testability-exercise-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "module.ts"), original);
  writeFileSync(join(root, "scenario.test.ts"), scaffold);
  writeFileSync(
    join(root, "regression.test.ts"),
    "import test from 'node:test'; import assert from 'node:assert/strict'; import {total} from './module.ts'; test('zero retained',()=>assert.equal(total(0),0));\n"
  );
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-qm", "baseline"], { cwd: root });
  const installed = join(root, ".keepup-install");
  cpSync(dirname(dirname(CLI)), installed, { recursive: true });
  const cli = join(installed, "scripts/keepup.mjs");
  run(root, cli, "init");
  const config = join(root, ".keepup/config.json");
  writeFileSync(
    config,
    JSON.stringify({
      ...JSON.parse(readFileSync(config, "utf-8")),
      testCommand: "node --test --test-reporter=tap regression.test.ts",
    })
  );

  return { cli, root };
}

function exercise<T>(root: string, cli: string, action: string, input: T) {
  return run(
    root,
    cli,
    "architecture",
    "exercise",
    action,
    JSON.stringify(input)
  );
}

function prepare(
  root: string,
  cli: string,
  added = false,
  baseline = definition("baseline"),
  compatibility: readonly ExistingTest[] = [],
  guardrails: readonly ExerciseGuardrail[] = []
) {
  run(root, cli, "architecture", "testability", JSON.stringify(baseline));

  const input = {
    assessmentId: "baseline",
    behaviour: "Positive and negative total outcomes",
    callers: ["regression.test.ts"],
    concepts,
    files: ["module.ts", "scenario.test.ts"],
    guardrails,
    id: "testability",
    invariants: ["Zero remains zero"],
    requiredTests: [{ file: "regression.test.ts", name: "zero retained" }],
    stopCondition: "Stop on regression",
    target: {
      command: "node --test --test-reporter=tap scenario.test.ts",
      compatibility,
      goal: 0,
      kind: "behavioural-testability",
      negative,
      positive,
      scenarioId: "total",
    },
    technique: "Verify through public interface",
    tradeoffs: [],
  };

  const transformation = {
    concepts: concepts.map((concept) => ({
      after: { ...concept, file: "new.test.ts" },
      before: concept,
    })),
    files: [
      {
        after: ["scenario.test.ts", "new.test.ts"],
        before: ["scenario.test.ts"],
        logicalModule: "totals",
      },
    ],
    modules: [
      {
        after: [
          {
            id: "totals",
            interface: ["module.ts"],
            members: ["module.ts", "scenario.test.ts", "new.test.ts"],
          },
        ],
        before: ["totals"],
      },
    ],
    review: {
      notes: "Learner test additions with own mapped learning",
      reviewer: "Fixture reviewer",
      status: "reviewed",
    },
  };

  const prepared = exercise(
    root,
    cli,
    "prepare",
    added
      ? {
          ...input,
          target: {
            ...input.target,
            command: "node --test --test-reporter=tap new.test.ts",
            negative: { ...negative, file: "new.test.ts" },
            positive: { ...positive, file: "new.test.ts" },
          },
          transformation,
        }
      : input
  );

  const preId = `${prepared.quizPrefix}actual`;
  run(
    root,
    cli,
    "log",
    JSON.stringify({
      answers: concepts.map((c, i) => ({
        ...c,
        answer: "Assert public outcome",
        correct: true,
        question: `Which outcome matters before ${i}?`,
      })),
      files: ["scenario.test.ts"],
      id: preId,
      phase: "pre",
      type: "quiz",
    })
  );
  exercise(root, cli, "start", {
    exerciseId: "testability",
    id: "start",
    preQuizIds: [preId],
  });

  return prepared;
}

function assessment(id: string) {
  return {
    attribution: [{ author: "learner", file: "scenario.test.ts" }],
    exerciseId: "testability",
    id,
    reason: "Learner authored new scenario checks",
    reviewedAssessmentId: "candidate",
    semanticReview: {
      callers: [
        {
          excerpt: "total(0),0",
          file: "regression.test.ts",
          rationale: "Zero retained",
        },
      ],
      changes: [
        {
          after: authored.trim(),
          before: scaffold.trim(),
          file: "scenario.test.ts",
          rationale: "Learner adds positive and invalid input assertions",
        },
      ],
      rationale: "Both public observable outcomes are asserted",
      reviewer: "Fixture reviewer",
      status: "reviewed",
      trustBoundaries: [],
    },
  };
}

for (const added of [false, true]) {
  test(`copied testability exercise preserves regressions and linked completion (${added ? "new mapped path" : "existing test file"})`, (t) => {
    const { root, cli } = fixture(t);
    prepare(root, cli, added);
    const file = added ? "new.test.ts" : "scenario.test.ts";
    writeFileSync(join(root, file), authored);

    if (added) {
      spawnSync("git", ["add", file], { cwd: root });
    }

    run(
      root,
      cli,
      "architecture",
      "testability",
      JSON.stringify(
        added
          ? {
              ...definition("candidate", true),
              module: {
                id: "totals",
                interface: ["module.ts"],
                members: ["module.ts", "scenario.test.ts", "new.test.ts"],
              },
              scenarios: definition("candidate", true).scenarios.map(
                (scenario) => ({
                  ...scenario,
                  assertion: { ...scenario.assertion, evidence: [file] },
                  tests: [
                    { ...positive, file },
                    { ...negative, file },
                  ],
                })
              ),
            }
          : definition("candidate", true)
      )
    );
    const sourceReview = assessment("accepted");

    const attempt = exercise(
      root,
      cli,
      "assess",
      added
        ? {
            ...sourceReview,
            attribution: [{ author: "learner", file }],
            semanticReview: {
              ...sourceReview.semanticReview,
              changes: [
                {
                  after: authored.trim(),
                  before: null,
                  file,
                  rationale:
                    "New learner authored positive and negative outcome assertions",
                },
              ],
            },
          }
        : sourceReview
    );

    assert.equal(
      attempt.status,
      "awaiting-learning",
      JSON.stringify(attempt.errors)
    );
    assert.equal(attempt.tests.tests, 1);
    assert.equal(attempt.additionalTests.tests, 2);
    assert.equal(attempt.target.current, 0);
    assert.equal(
      readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
        '"architecture_pass"'
      ),
      false
    );
    const postId = `${attempt.quizPrefix}actual`;
    run(
      root,
      cli,
      "log",
      JSON.stringify({
        answers: concepts.map((c, i) => ({
          ...c,
          answer: "The exported total supplies outcomes",
          correct: true,
          file,
          question: `How does the assertion prove case ${i}?`,
        })),
        files: [file],
        id: postId,
        phase: "post",
        type: "quiz",
      })
    );
    const explainId = `${attempt.quizPrefix}explain`;
    run(
      root,
      cli,
      "log",
      JSON.stringify({
        files: [file],
        id: explainId,
        text: "The positive input returns six and negative input throws through the public export. Existing zero regression stays unchanged.",
        type: "explain",
      })
    );

    const completion = {
      attemptId: "accepted",
      exerciseId: "testability",
      explainId,
      id: "complete",
      invariantReview: [
        {
          evidence: "Original regression executed unchanged",
          invariant: "Zero remains zero",
          preserved: true,
        },
      ],
      postQuizIds: [postId],
    };

    assert.equal(exercise(root, cli, "complete", completion).state, "passed");
    assert.equal(exercise(root, cli, "complete", completion).state, "passed");

    const events = readFileSync(join(root, ".keepup/events.jsonl"), "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    assert.equal(
      events.filter((e) => e.type === "architecture_pass").length,
      1
    );
  });
}

test("testability rejects weakened regressions, changed scenarios, invalid assertions, unavailable cases and unresolved work", (t) => {
  const { root, cli } = fixture(t);
  const prepared = prepare(root, cli);
  writeFileSync(join(root, "scenario.test.ts"), authored);
  const candidate = definition("candidate", true);
  run(root, cli, "architecture", "testability", JSON.stringify(candidate));

  const configPath = join(root, ".keepup/config.json");
  const frozenConfig = readFileSync(configPath, "utf-8");
  writeFileSync(
    configPath,
    JSON.stringify({
      ...JSON.parse(frozenConfig),
      testCommand:
        "node --test --test-reporter=tap regression.test.ts scenario.test.ts",
    })
  );
  assert.match(
    exercise(root, cli, "assess", assessment("changed-command")).errors.join(
      " "
    ),
    /Frozen evaluator/u
  );
  writeFileSync(configPath, frozenConfig);

  const baselineRegression = readFileSync(
    join(root, "regression.test.ts"),
    "utf-8"
  );

  writeFileSync(
    join(root, "regression.test.ts"),
    `${baselineRegression}// weakened or modified regression\n`
  );
  const regression = exercise(root, cli, "assess", assessment("regression"));
  assert.equal(regression.status, "failed");
  assert.match(regression.errors.join(" "), /frozen behavioural test/u);
  writeFileSync(join(root, "regression.test.ts"), baselineRegression);
  writeFileSync(join(root, "undeclared.ts"), "export const hidden = true;\n");
  assert.match(
    exercise(root, cli, "assess", assessment("undeclared")).errors.join(" "),
    /untracked/u
  );
  rmSync(join(root, "undeclared.ts"));

  for (const author of ["agent", "unresolved"]) {
    const result = exercise(root, cli, "assess", {
      ...assessment(author),
      attribution: [{ author, file: "scenario.test.ts" }],
    });

    assert.match(result.errors.join(" "), /attribution/u);
  }

  const [scenario] = candidate.scenarios;
  assert.ok(scenario);

  const cases = [
    { ...candidate, discovery: "incomplete" },
    {
      ...candidate,
      scenarios: [{ ...scenario, failureInvariant: "Different question" }],
    },
    {
      ...candidate,
      scenarios: [{ ...scenario, intendedInterface: "scenario.test.ts" }],
    },
    { ...candidate, scenarios: [{ ...scenario, tests: [positive] }] },
    {
      ...candidate,
      scenarios: [
        {
          ...scenario,
          assertion: { ...scenario.assertion, status: "provisional" },
        },
      ],
    },
    {
      ...candidate,
      scenarios: [
        {
          ...scenario,
          assertion: { ...scenario.assertion, kind: "interaction-only" },
        },
      ],
    },
    {
      ...candidate,
      scenarios: [
        {
          ...scenario,
          assertion: { ...scenario.assertion, throughInterface: false },
        },
      ],
    },
  ];

  for (const [index, changed] of cases.entries()) {
    const id = `contract-${index}`;

    const recorded = command(
      root,
      cli,
      "architecture",
      "testability",
      JSON.stringify({ ...changed, id })
    );

    if (recorded.status !== 0) {
      assert.match(recorded.stderr, /intended module interface/u);
      continue;
    }

    const attempt = exercise(root, cli, "assess", {
      ...assessment(id),
      reviewedAssessmentId: id,
    });

    assert.equal(attempt.status, "failed", JSON.stringify(attempt));
  }

  for (const [index, code] of [
    "",
    authored.replace(
      "test('negative rejected'",
      "test.skip('negative rejected'"
    ),
  ].entries()) {
    const id = `unavailable-${index}`;
    writeFileSync(join(root, "scenario.test.ts"), code);
    run(
      root,
      cli,
      "architecture",
      "testability",
      JSON.stringify({ ...candidate, id })
    );

    const attempt = exercise(root, cli, "assess", {
      ...assessment(id),
      reviewedAssessmentId: id,
    });

    assert.equal(attempt.status, "failed", JSON.stringify(attempt));
  }

  writeFileSync(join(root, "scenario.test.ts"), `${authored}// source drift\n`);
  const stale = exercise(root, cli, "assess", assessment("stale"));
  assert.match(stale.errors.join(" "), /exact current candidate/u);
  assert.deepEqual(exercise(root, cli, "assess", assessment("stale")), stale);
  assert.equal(
    command(
      root,
      cli,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify({ ...assessment("stale"), reason: "different retry" })
    ).status,
    1
  );

  const context = run(
    root,
    cli,
    "architecture",
    "exercise",
    "inspect",
    "testability",
    "--json"
  );

  assert.deepEqual(context.preparation, prepared);
  assert.equal(context.pass, null);
  assert.equal(
    exercise(root, cli, "abandon", {
      exerciseId: "testability",
      id: "abandon",
      reason: "Learner stops",
    }).state,
    "abandoned"
  );
  assert.equal(
    readFileSync(join(root, "scenario.test.ts"), "utf-8"),
    `${authored}// source drift\n`
  );
});

test("testability requires prepared production compatibility and rejects a source race during additional execution", (t) => {
  const missing = fixture(t);
  const baseline = definition("baseline");

  const remote: TestabilityAssessmentInput = {
    ...baseline,
    scenarios: baseline.scenarios.map((scenario) => ({
      ...scenario,
      dependency: {
        compatibilityRequired: true,
        justification: "Owned production adapter",
        kind: "owned-remote",
      },
    })),
  };

  assert.throws(
    () => prepare(missing.root, missing.cli, false, remote),
    /compatibility checks must be prepared/u
  );

  const { root, cli } = fixture(t);
  prepare(root, cli);
  const drift = `${authored}import {existsSync,readFileSync,writeFileSync} from 'node:fs'; if(existsSync('.keepup/extra-drift'))writeFileSync('module.ts',readFileSync('module.ts','utf-8')+'// concurrent source change\\n');\n`;
  writeFileSync(join(root, "scenario.test.ts"), drift);
  run(
    root,
    cli,
    "architecture",
    "testability",
    JSON.stringify(definition("candidate", true))
  );
  writeFileSync(join(root, ".keepup/extra-drift"), "go");
  const attempt = exercise(root, cli, "assess", assessment("race"));
  assert.equal(attempt.status, "failed");
  assert.match(attempt.errors.join(" "), /changed during assessment/u);
  assert.equal(
    readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
      '"architecture_pass"'
    ),
    false
  );
});

test("prepared dependency compatibility executes separately and cannot disappear from the selected contract", (t) => {
  const { root, cli } = fixture(t);
  const baseline = definition("baseline");

  const dependency: TestabilityAssessmentInput["scenarios"][number]["dependency"] =
    {
      compatibilityRequired: true,
      justification:
        "Check the selected local substitute against its agreed production contract",
      kind: "local-substitute",
    };

  const contract = {
    ...baseline,
    scenarios: baseline.scenarios.map((scenario) => ({
      ...scenario,
      dependency,
    })),
  };

  const compatibility = {
    file: "scenario.test.ts",
    name: "dependency compatible",
  };

  prepare(root, cli, false, contract, [compatibility]);
  writeFileSync(
    join(root, "scenario.test.ts"),
    `${authored}test('dependency compatible',()=>assert.equal(total(2),4));\n`
  );

  const candidate = {
    ...definition("candidate", true),
    scenarios: definition("candidate", true).scenarios.map((scenario) => ({
      ...scenario,
      compatibility: [compatibility],
      dependency,
    })),
  };

  run(root, cli, "architecture", "testability", JSON.stringify(candidate));
  const accepted = exercise(root, cli, "assess", assessment("compatibility"));
  assert.equal(
    accepted.status,
    "awaiting-learning",
    JSON.stringify(accepted.errors)
  );
  assert.equal(accepted.additionalTests.tests, 3);
  assert.equal(accepted.additionalTests.witnesses.length, 3);

  const omitted = {
    ...candidate,
    id: "omitted",
    scenarios: candidate.scenarios.map((scenario) => ({
      ...scenario,
      compatibility: [],
    })),
  };

  run(root, cli, "architecture", "testability", JSON.stringify(omitted));

  const rejected = exercise(root, cli, "assess", {
    ...assessment("omitted"),
    reviewedAssessmentId: "omitted",
  });

  assert.equal(rejected.status, "failed");
  assert.match(rejected.errors.join(" "), /prepared test identities/u);
});

test(
  "testability supports selected graph guards and defers transformation combinations before learner edits",
  { skip: !process.env.KEEPUP_TEST_ANALYSER_DIRECTORY },
  (t) => {
    const { root, cli } = fixture(t);

    const graph = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify({
        dimension: "seam-integrity",
        evidence: ["module.ts", "scenario.test.ts", "regression.test.ts"],
        exclusions: [],
        id: "testability-graph",
        limitations: [],
        modules: [
          {
            id: "totals",
            interface: ["module.ts"],
            members: ["module.ts", "scenario.test.ts"],
          },
          {
            id: "regressions",
            interface: ["regression.test.ts"],
            members: ["regression.test.ts"],
          },
        ],
        rules: [
          {
            dependency: "all",
            from: "totals",
            id: "no-regressions",
            kind: "forbidden",
            to: "regressions",
          },
        ],
      })
    );

    assert.equal(graph.analysis.status, "complete");

    const guardrails: readonly ExerciseGuardrail[] = [
      {
        assessmentId: "testability-graph",
        kind: "forbidden-direction",
        ruleId: "no-regressions",
      },
    ];

    assert.throws(
      () => prepare(root, cli, true, definition("baseline"), [], guardrails),
      /reviewed source transformations/u
    );

    const prepared = prepare(
      root,
      cli,
      false,
      definition("baseline"),
      [],
      guardrails
    );

    assert.equal(prepared.guardrails[0].baseline, 0);
    assert.equal(prepared.supportingAssessments.length, 1);
    writeFileSync(join(root, "scenario.test.ts"), authored);
    run(
      root,
      cli,
      "architecture",
      "testability",
      JSON.stringify(definition("candidate", true))
    );

    const attempt = exercise(
      root,
      cli,
      "assess",
      assessment("graph-supported")
    );

    assert.equal(
      attempt.status,
      "awaiting-learning",
      JSON.stringify(attempt.errors)
    );
    assert.equal(attempt.guardrails[0].current, 0);
  }
);
