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

import type {
  CallerObligation,
  InterfaceAssessmentInput,
} from "../scripts/architecture/domain.ts";

const CLI = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));

const provider =
  "export const begin=()=>{const rows:number[]=[];return rows;}; export const append=(rows:number[],amount:number)=>{if(amount<0)throw new Error('negative');rows.push(amount);}; export const finish=(rows:number[])=>rows.reduce((sum,row)=>sum+row,0);\n";

const caller =
  "import {begin,append,finish} from './module.ts'; export const order=(amount:number)=>{const rows=begin();append(rows,amount);return finish(rows);};\n";

const deepProvider = `${
  provider
}export const save=(amount:number)=>{const rows=begin();append(rows,amount);return finish(rows);};\n`;

const deepCaller =
  "import {save} from './module.ts'; export const order=(amount:number)=>save(amount);\n";

const concepts = [
  "transaction ordering",
  "amount choice",
  "negative amount",
].map((concept, index) => ({
  concept,
  file: index === 0 ? "module.ts" : "caller.ts",
}));

function execute(root: string, cli: string, ...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
  });
}

function run(root: string, cli: string, ...args: string[]) {
  const result = execute(root, cli, ...args);
  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
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

const orderingObligation: CallerObligation = {
  classification: "avoidable",
  description: "Begin, append and finish in order",
  evidence: ["caller.ts"],
  kind: "ordering",
};

function definition(id: string, improved = false): InterfaceAssessmentInput {
  return {
    dimension: "interface-leverage",
    evidence: ["module.ts", "caller.ts"],
    exclusions: [],
    id,
    limitations: ["Seam safety unmeasured; unrelated graph unavailable"],
    module: { id: "orders", interface: ["module.ts"], members: ["module.ts"] },
    review: {
      confidence: "high",
      notes: "Inspected source and caller outcomes",
      reviewer: "Fixture reviewer",
      status: "reviewed",
    },
    scenarios: [
      {
        description: "Save a positive amount",
        evidence: ["caller.ts", "behaviour.test.ts"],
        id: "checkout",
        obligations: [
          {
            classification: "domain",
            description: "Choose the order amount",
            evidence: ["caller.ts"],
            kind: "arguments",
          },
          ...(improved ? [] : [orderingObligation]),
        ],
        rating: improved ? 1 : 0.5,
        rationale: improved
          ? "Module owns sequence"
          : "Caller orchestrates sequence",
      },
      {
        description: "Reject negative amounts",
        evidence: ["caller.ts", "behaviour.test.ts"],
        id: "rejection",
        obligations: [
          {
            classification: "domain",
            description: "Choose the order amount",
            evidence: ["caller.ts"],
            kind: "arguments",
          },
          ...(improved ? [] : [orderingObligation]),
        ],
        rating: improved ? 1 : 0.5,
        rationale: "Negative behaviour remains stable",
      },
    ],
  };
}

function preparation() {
  return {
    assessmentId: "baseline",
    behaviour: "Save chosen amount and reject negatives",
    callers: ["caller.ts", "behaviour.test.ts"],
    concepts,
    files: ["module.ts", "caller.ts"],
    guardrails: [],
    id: "interface",
    invariants: ["Chosen nonnegative amount returned; negatives rejected"],
    requiredTests: [
      {
        file: "behaviour.test.ts",
        name: "chosen amount and negative rejection",
      },
    ],
    stopCondition: "Stop if caller loses amount choice or rejection",
    target: {
      goal: 0,
      kind: "interface-leverage",
      obligation: "Begin, append and finish in order",
      obligationKind: "ordering",
      scenarioId: "checkout",
    },
    technique: "Deepen order interface",
    tradeoffs: [],
  };
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "interface-exercise-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "module.ts"), provider);
  writeFileSync(join(root, "caller.ts"), caller);
  writeFileSync(
    join(root, "behaviour.test.ts"),
    "import assert from 'node:assert/strict'; import test from 'node:test'; import {order} from './caller.ts'; test('chosen amount and negative rejection',()=>{assert.equal(order(7),7);assert.equal(order(0),0);assert.throws(()=>order(-1),/negative/u);});\n"
  );
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-qm", "baseline"], { cwd: root });
  const installed = join(root, ".installed");
  cpSync(dirname(dirname(CLI)), installed, { recursive: true });
  const cli = join(installed, "scripts/keepup.mjs");
  run(root, cli, "init");
  const config = join(root, ".keepup/config.json");
  writeFileSync(
    config,
    JSON.stringify({
      ...JSON.parse(readFileSync(config, "utf-8")),
      testCommand: "node --test --test-reporter=tap behaviour.test.ts",
    })
  );

  return { cli, root };
}

function start(root: string, cli: string, inventory = concepts) {
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("baseline"))
  );

  const prepared = exercise(root, cli, "prepare", {
    ...preparation(),
    concepts: inventory,
  });

  const id = `${prepared.quizPrefix}answers`;
  run(
    root,
    cli,
    "log",
    JSON.stringify({
      answers: inventory.map((concept, i) => ({
        ...concept,
        answer: "Caller coordinates transaction while choosing the amount",
        correct: true,
        question: `Why does baseline caller own step ${i}?`,
      })),
      files: [...new Set(inventory.map((concept) => concept.file))],
      id,
      phase: "pre",
      type: "quiz",
    })
  );
  exercise(root, cli, "start", {
    exerciseId: "interface",
    id: "start",
    preQuizIds: [id],
  });

  return prepared;
}

function assessment(id: string) {
  return {
    attribution: [
      { author: "learner", file: "caller.ts" },
      { author: "learner", file: "module.ts" },
    ],
    exerciseId: "interface",
    id,
    reason: "Actual learner confirms edits",
    reviewedAssessmentId: "candidate",
    semanticReview: {
      callers: [
        {
          excerpt: "order=(amount:number)=>save(amount)",
          file: "caller.ts",
          rationale: "No orchestration remains at either frozen scenario",
        },
        {
          excerpt: "assert.throws(()=>order(-1),/negative/u)",
          file: "behaviour.test.ts",
          rationale: "Validation outcome remains observable",
        },
      ],
      changes: [
        {
          after: deepProvider.trim(),
          before: provider.trim(),
          file: "module.ts",
          rationale: "Module now owns complete save outcome",
        },
        {
          after: deepCaller.trim(),
          before: caller.trim(),
          file: "caller.ts",
          rationale: "Caller expresses save intent while choosing amount",
        },
      ],
      rationale:
        "Order module owns former begin/append/finish orchestration; callers retain their amount choice and meaningful errors",
      reviewer: "Fixture reviewer",
      status: "reviewed",
      trustBoundaries: [],
    },
  };
}

function improve(root: string, cli: string, id = "candidate") {
  writeFileSync(join(root, "module.ts"), deepProvider);
  writeFileSync(join(root, "caller.ts"), deepCaller);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition(id, true))
  );
}

function complete(
  root: string,
  cli: string,
  attempt: { quizPrefix: string; input: { id: string } },
  inventory = concepts
) {
  const postId = `${attempt.quizPrefix}answers`;
  run(
    root,
    cli,
    "log",
    JSON.stringify({
      answers: inventory.map((concept, i) => ({
        ...concept,
        answer:
          "Save owns orchestration; caller chooses amount and observes validation",
        correct: true,
        question: `How does deepened interface retain outcome ${i}?`,
      })),
      files: [...new Set(inventory.map((concept) => concept.file))],
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
      files: ["caller.ts", "module.ts"],
      id: explainId,
      text: "Save now owns begin/append/finish sequencing. Callers still choose amounts and receive the same result or negative-amount error.",
      type: "explain",
    })
  );

  return {
    attemptId: attempt.input.id,
    exerciseId: "interface",
    explainId,
    id: "complete",
    invariantReview: [
      {
        evidence:
          "Reviewed positive, zero and negative public caller execution with unchanged tests",
        invariant: "Chosen nonnegative amount returned; negatives rejected",
        preserved: true,
      },
    ],
    postQuizIds: [postId],
  };
}

test("copied interface journey removes orchestration, preserves domain choices and grants one practice event after actual learning", (t) => {
  const { root, cli } = fixture(t);
  start(root, cli);
  improve(root, cli);
  const attempt = exercise(root, cli, "assess", assessment("assessed"));
  assert.equal(
    attempt.status,
    "awaiting-learning",
    JSON.stringify(attempt.errors)
  );
  assert.equal(attempt.target.baseline, 2);
  assert.equal(attempt.target.current, 0);
  assert.equal(
    readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
      '"architecture_pass"'
    ),
    false
  );
  const completion = complete(root, cli, attempt);
  assert.equal(exercise(root, cli, "complete", completion).state, "passed");
  assert.equal(exercise(root, cli, "complete", completion).state, "passed");

  const events = readFileSync(join(root, ".keepup/events.jsonl"), "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.equal(
    events.filter((event) => event.type === "architecture_pass").length,
    1
  );
});

test("interface rejects supplied ratings, responsibility shifts and changed scenarios without changing original baselines", (t) => {
  const { root, cli } = fixture(t);
  const prepared = start(root, cli);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("candidate", true))
  );
  const metadata = exercise(root, cli, "assess", assessment("rating-only"));
  assert.equal(metadata.status, "failed");
  assert.match(metadata.errors.join(" "), /No attributable source/u);
  assert.deepEqual(
    exercise(root, cli, "assess", assessment("rating-only")),
    metadata
  );
  improve(root, cli);
  const baseline = definition("shifted", true);

  const shifted = {
    ...baseline,
    scenarios: baseline.scenarios.map((scenario) => ({
      ...scenario,
      obligations: [
        ...scenario.obligations,
        {
          classification: "avoidable",
          description: "Configure transaction somewhere else",
          evidence: ["caller.ts"],
          kind: "configuration",
        },
      ],
    })),
  };

  run(root, cli, "architecture", "record", JSON.stringify(shifted));
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("shifted"),
      reviewedAssessmentId: "shifted",
    }).errors.join(" "),
    /renamed or shifted/u
  );

  const removed = {
    ...definition("removed", true),
    scenarios: definition("removed", true).scenarios.slice(0, 1),
  };

  run(root, cli, "architecture", "record", JSON.stringify(removed));
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("removed"),
      reviewedAssessmentId: "removed",
    }).errors.join(" "),
    /scenario inventory/u
  );

  const domain = {
    ...definition("domain", true),
    scenarios: definition("domain", true).scenarios.map((scenario) => ({
      ...scenario,
      obligations: [],
    })),
  };

  run(root, cli, "architecture", "record", JSON.stringify(domain));
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("domain"),
      reviewedAssessmentId: "domain",
    }).errors.join(" "),
    /domain choices/u
  );

  const renamed = {
    ...definition("renamed", true),
    scenarios: definition("renamed", true).scenarios.map((scenario) => ({
      ...scenario,
      description: "Simpler different outcome",
    })),
  };

  run(root, cli, "architecture", "record", JSON.stringify(renamed));
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("renamed"),
      reviewedAssessmentId: "renamed",
    }).errors.join(" "),
    /scenario identities/u
  );

  const context = run(
    root,
    cli,
    "architecture",
    "exercise",
    "inspect",
    "interface",
    "--json"
  );

  assert.deepEqual(context.preparation, prepared);
  assert.equal(context.pass, null);
});

test("interface requires changed module ownership, exact-source reviewed acceptance and preserved behavioural validation", (t) => {
  const { root, cli } = fixture(t);
  start(root, cli);
  writeFileSync(
    join(root, "caller.ts"),
    caller.replace(
      "export const order",
      "// moved only locally\nexport const order"
    )
  );
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("candidate", true))
  );
  const shifted = assessment("hidden-wrapper");
  assert.match(
    exercise(root, cli, "assess", {
      ...shifted,
      attribution: [{ author: "learner", file: "caller.ts" }],
    }).errors.join(" "),
    /module ownership/u
  );
  improve(root, cli, "deep");
  const provisional = definition("provisional", true);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify({
      ...provisional,
      review: { ...provisional.review, status: "provisional" },
    })
  );
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("provisional"),
      reviewedAssessmentId: "provisional",
    }).errors.join(" "),
    /complete and reviewed/u
  );
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("review-unresolved"),
      semanticReview: {
        ...assessment("x").semanticReview,
        status: "provisional",
      },
    }).errors.join(" "),
    /semantic review/u
  );
  writeFileSync(
    join(root, "module.ts"),
    deepProvider.replace("if(amount<0)throw new Error('negative');", "")
  );
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("invalid", true))
  );
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("validation-removed"),
      reviewedAssessmentId: "invalid",
    }).errors.join(" "),
    /test command did not complete/u
  );
  writeFileSync(join(root, "module.ts"), deepProvider);
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("stale"),
      reviewedAssessmentId: "invalid",
    }).errors.join(" "),
    /exact current candidate/u
  );
  improve(root, cli, "deep");

  const attempt = exercise(root, cli, "assess", {
    ...assessment("accepted"),
    reviewedAssessmentId: "deep",
  });

  assert.equal(
    attempt.status,
    "awaiting-learning",
    JSON.stringify(attempt.errors)
  );
  const completion = complete(root, cli, attempt);
  writeFileSync(join(root, "caller.ts"), `${deepCaller}// late edit\n`);

  const stale = execute(
    root,
    cli,
    "architecture",
    "exercise",
    "complete",
    JSON.stringify(completion)
  );

  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /Candidate source/u);
  assert.equal(
    exercise(root, cli, "abandon", {
      exerciseId: "interface",
      id: "abandon",
      reason: "Learner preserves edits and closes context",
    }).state,
    "abandoned"
  );
  assert.match(readFileSync(join(root, "caller.ts"), "utf-8"), /late edit/u);
});

test("reviewed completion cannot grant practice to changed provider without its own prepared learner evidence", (t) => {
  const { root, cli } = fixture(t);

  const callerOnly = concepts.map((concept) => ({
    ...concept,
    file: "caller.ts",
  }));

  start(root, cli, callerOnly);
  improve(root, cli);
  const attempt = exercise(root, cli, "assess", assessment("assessed"));
  assert.equal(
    attempt.status,
    "awaiting-learning",
    JSON.stringify(attempt.errors)
  );
  const completion = complete(root, cli, attempt, callerOnly);

  const rejected = execute(
    root,
    cli,
    "architecture",
    "exercise",
    "complete",
    JSON.stringify(completion)
  );

  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Every changed practice file/u);
  assert.equal(
    readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
      '"architecture_pass"'
    ),
    false
  );
  assert.equal(
    run(root, cli, "architecture", "exercise", "inspect", "interface", "--json")
      .state,
    "active"
  );
});
