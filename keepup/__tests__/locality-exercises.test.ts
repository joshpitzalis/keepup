import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
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
import type { LocalityAssessmentInput } from "../scripts/architecture/locality.ts";

const CLI = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));

function execute(root: string, cli: string, ...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      KEEPUP_ANALYSER_DIRECTORY: existsSync(
        join(root, ".keepup/fixture-analyser")
      )
        ? join(root, ".keepup/fixture-analyser")
        : process.env.KEEPUP_TEST_ANALYSER_DIRECTORY,
    },
  });
}

function run(root: string, cli: string, ...args: string[]) {
  const result = execute(root, cli, ...args);
  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

const before =
  "export const weight=(score:number)=>score/2; export const delayed=(score:number)=>score/2;\n";

const after =
  "export const weight=(score:number)=>score/2; export const delayed=(score:number)=>weight(score);\n";

const concepts = ["weighting policy", "delayed outcome", "zero score"].map(
  (concept) => ({ concept, file: "policy.ts" })
);

function definition(id: string, consolidated = false): LocalityAssessmentInput {
  return {
    changes: [
      {
        affectedOwners: ["learning", "delayed"],
        description: "Change post weighting",
        evidence: ["policy.ts"],
        id: "weight-change",
      },
    ],
    dimension: "change-locality",
    disagreements: [],
    evidence: ["policy.ts"],
    exclusions: [],
    id,
    limitations: ["No graph evidence; seam safety unmeasured"],
    module: {
      id: "learning",
      interface: ["policy.ts"],
      members: ["policy.ts"],
    },
    review: {
      confidence: "high",
      notes: "Compared actual source and representative callers",
      reviewer: "Fixture reviewer",
      status: "reviewed",
    },
    rules: [
      {
        description: "Half post score",
        equivalence: "Learning and delayed checks both halve the same score",
        evidence: ["policy.ts"],
        id: "half",
        sites: [
          {
            evidence: ["policy.ts"],
            file: "policy.ts",
            id: "weight",
            implementation: null,
            location: "weight",
            reason: "Authoritative weighting",
            role: "policy",
            trustBoundary: null,
          },
          {
            evidence: ["policy.ts"],
            file: "policy.ts",
            id: "delayed",
            implementation: consolidated ? "weight" : null,
            location: "delayed",
            reason: "Delayed weighting",
            role: consolidated ? "call" : "policy",
            trustBoundary: null,
          },
        ],
        status: "confirmed",
      },
    ],
  };
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "locality-exercise-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "policy.ts"), before);
  writeFileSync(
    join(root, "behaviour.test.ts"),
    "import test from 'node:test'; import assert from 'node:assert/strict'; import {weight,delayed} from './policy.ts'; test('learning and delayed retain half weight',()=>{for(const score of [0,0.5,1]) {assert.equal(weight(score),score/2); assert.equal(delayed(score),score/2);}});\n"
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
      testCommand: "node --test --test-reporter=tap behaviour.test.ts",
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
  guardrails: readonly ExerciseGuardrail[] = [],
  assessmentId = "baseline"
) {
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition(assessmentId))
  );

  const preparation = {
    assessmentId,
    behaviour: "Learning and delayed outcomes retain half score",
    callers: ["behaviour.test.ts"],
    concepts,
    files: ["policy.ts"],
    guardrails,
    id: "locality",
    invariants: ["Both consumers return half score"],
    requiredTests: [
      {
        file: "behaviour.test.ts",
        name: "learning and delayed retain half weight",
      },
    ],
    stopCondition: "Stop on outcome drift",
    target: { goal: 1, kind: "change-locality", ruleId: "half" },
    technique: "Consolidate half weighting",
    tradeoffs: [],
  };

  const prepared = exercise(root, cli, "prepare", preparation);
  const preId = `${prepared.quizPrefix}answers`;
  run(
    root,
    cli,
    "log",
    JSON.stringify({
      answers: concepts.map((c, i) => ({
        ...c,
        answer: "Both consumers halve the score",
        correct: true,
        question: `Which policy owns case ${i}?`,
      })),
      files: ["policy.ts"],
      id: preId,
      phase: "pre",
      type: "quiz",
    })
  );
  exercise(root, cli, "start", {
    exerciseId: "locality",
    id: "start",
    preQuizIds: [preId],
  });

  return prepared;
}

function assessment(id: string) {
  return {
    attribution: [{ author: "learner", file: "policy.ts" }],
    exerciseId: "locality",
    id,
    reason: "Learner confirms authored consolidation",
    reviewedAssessmentId: "candidate",
    semanticReview: {
      callers: [
        {
          excerpt: "delayed(score),score/2",
          file: "behaviour.test.ts",
          rationale: "Both observable outcomes retain half weight",
        },
      ],
      changes: [
        {
          after: "delayed=(score:number)=>weight(score)",
          before: "delayed=(score:number)=>score/2",
          file: "policy.ts",
          rationale: "Same half-score policy now delegates",
        },
      ],
      rationale:
        "The delayed consumer now delegates to the original authoritative weight implementation",
      reviewer: "Fixture reviewer",
      status: "reviewed",
      trustBoundaries: [],
    },
  };
}

test("copied locality journey consolidates half weighting with unchanged complexity and records one practice only after learning", (t) => {
  const { root, cli } = fixture(t);
  prepare(root, cli);
  writeFileSync(join(root, "policy.ts"), after);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("candidate", true))
  );
  const attempt = exercise(root, cli, "assess", assessment("accepted"));
  assert.equal(
    attempt.status,
    "awaiting-learning",
    JSON.stringify(attempt.errors)
  );
  assert.equal(attempt.target.current, 1);
  assert.equal(
    readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
      '"architecture_pass"'
    ),
    false
  );
  const complete = completionInput(root, cli, attempt);

  assert.equal(exercise(root, cli, "complete", complete).state, "passed");
  assert.equal(exercise(root, cli, "complete", complete).state, "passed");

  const events = readFileSync(join(root, ".keepup/events.jsonl"), "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.equal(
    events.filter((event) => event.type === "architecture_pass").length,
    1
  );
});

test("locality rejects metadata, dropped sites, stale source, provisional evidence and nonlearner work while preserving retries and baselines", (t) => {
  const { root, cli } = fixture(t);
  const prepared = prepare(root, cli);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("candidate", true))
  );
  const unchanged = exercise(root, cli, "assess", assessment("metadata"));
  assert.equal(unchanged.status, "failed");
  assert.match(unchanged.errors.join(" "), /No attributable source/u);
  assert.deepEqual(
    exercise(root, cli, "assess", assessment("metadata")),
    unchanged
  );

  const retry = execute(
    root,
    cli,
    "architecture",
    "exercise",
    "assess",
    JSON.stringify({ ...assessment("metadata"), reason: "changed" })
  );

  assert.equal(retry.status, 1);
  writeFileSync(
    join(root, "policy.ts"),
    `${before}// irrelevant comment only\n`
  );
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("irrelevant", true))
  );
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("irrelevant"),
      reviewedAssessmentId: "irrelevant",
    }).errors.join(" "),
    /excerpts/u
  );
  writeFileSync(join(root, "policy.ts"), after);
  assert.match(
    exercise(root, cli, "assess", assessment("mixed")).errors.join(" "),
    /exact current candidate/u
  );
  const omitted = definition("omitted", true);
  const [omittedRule] = omitted.rules;
  assert.ok(omittedRule);

  const omittedInput = {
    ...omitted,
    rules: [{ ...omittedRule, sites: omittedRule.sites.slice(0, 1) }],
  };

  run(root, cli, "architecture", "record", JSON.stringify(omittedInput));
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("omitted"),
      reviewedAssessmentId: "omitted",
    }).errors.join(" "),
    /Original policy sites/u
  );
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("current", true))
  );

  for (const author of ["agent", "unresolved"]) {
    assert.match(
      exercise(root, cli, "assess", {
        ...assessment(author),
        attribution: [{ author, file: "policy.ts" }],
        reviewedAssessmentId: "current",
      }).errors.join(" "),
      /attribution/u
    );
  }

  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("provisional"),
      reviewedAssessmentId: "current",
      semanticReview: {
        ...assessment("x").semanticReview,
        status: "provisional",
      },
    }).errors.join(" "),
    /semantic review/u
  );
  assert.match(
    exercise(root, cli, "assess", {
      ...assessment("fake-excerpt"),
      reviewedAssessmentId: "current",
      semanticReview: {
        ...assessment("x").semanticReview,
        changes: [
          {
            ...assessment("x").semanticReview.changes[0],
            before: "invented original source",
          },
        ],
      },
    }).errors.join(" "),
    /excerpts/u
  );

  const context = run(
    root,
    cli,
    "architecture",
    "exercise",
    "inspect",
    "locality",
    "--json"
  );

  assert.deepEqual(context.preparation, prepared);
  assert.equal(context.state, "active");
  assert.equal(context.pass, null);
  assert.equal(
    exercise(root, cli, "abandon", {
      exerciseId: "locality",
      id: "abandon",
      reason: "Learner changes direction",
    }).state,
    "abandoned"
  );
  assert.equal(readFileSync(join(root, "policy.ts"), "utf-8"), after);
});

test("necessary validation and full unchanged regression checks cannot be traded for fewer policy sites", (t) => {
  const { root, cli } = fixture(t);

  const checkedBefore = before.replaceAll(
    "=>score/2",
    "=>{if(score<0)throw new Error('negative');return score/2;}"
  );

  const checkedAfter = after.replace(
    "=>score/2",
    "=>{if(score<0)throw new Error('negative');return score/2;}"
  );

  writeFileSync(join(root, "policy.ts"), checkedBefore);
  const tests = join(root, "behaviour.test.ts");
  writeFileSync(
    tests,
    `${readFileSync(
      tests,
      "utf-8"
    )}import {weight as checkedWeight,delayed as checkedDelayed} from './policy.ts'; test('negative inputs stay rejected',()=>{assert.throws(()=>checkedWeight(-1),/negative/u);assert.throws(()=>checkedDelayed(-1),/negative/u);});\n`
  );
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-qm", "validation boundary fixture"], {
    cwd: root,
  });
  const original = definition("boundary-baseline");

  const originalWithBoundary = {
    ...original,
    rules: original.rules.map((rule) => ({
      ...rule,
      sites: rule.sites.map((site) =>
        site.id === "delayed"
          ? { ...site, trustBoundary: "delayed input" }
          : site
      ),
    })),
  };

  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(originalWithBoundary)
  );

  const prep = {
    assessmentId: "boundary-baseline",
    behaviour: "Half weighting and negative rejection",
    callers: ["behaviour.test.ts"],
    concepts,
    files: ["policy.ts"],
    guardrails: [],
    id: "locality",
    invariants: ["Both consumers return half score"],
    requiredTests: [
      {
        file: "behaviour.test.ts",
        name: "learning and delayed retain half weight",
      },
      { file: "behaviour.test.ts", name: "negative inputs stay rejected" },
    ],
    stopCondition: "Stop on validation loss",
    target: { goal: 1, kind: "change-locality", ruleId: "half" },
    technique: "Consolidate validated weighting",
    tradeoffs: [],
  };

  const prepared = exercise(root, cli, "prepare", prep);
  const preId = `${prepared.quizPrefix}answers`;
  run(
    root,
    cli,
    "log",
    JSON.stringify({
      answers: concepts.map((c, i) => ({
        ...c,
        answer: "Half score with rejection",
        correct: true,
        question: `What happens before edits ${i}?`,
      })),
      files: ["policy.ts"],
      id: preId,
      phase: "pre",
      type: "quiz",
    })
  );
  exercise(root, cli, "start", {
    exerciseId: "locality",
    id: "start",
    preQuizIds: [preId],
  });
  writeFileSync(join(root, "policy.ts"), after);
  const candidate = definition("candidate", true);

  const candidateWithBoundary = {
    ...candidate,
    rules: candidate.rules.map((rule) => ({
      ...rule,
      sites: rule.sites.map((site) =>
        site.id === "delayed"
          ? { ...site, trustBoundary: "delayed input" }
          : site
      ),
    })),
  };

  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(candidateWithBoundary)
  );
  assert.match(
    exercise(root, cli, "assess", assessment("lost-validation")).errors.join(
      " "
    ),
    /test command did not complete/u
  );
  writeFileSync(join(root, "policy.ts"), checkedAfter);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify({ ...candidateWithBoundary, id: "preserved" })
  );

  const review = {
    ...assessment("boundary"),
    reviewedAssessmentId: "preserved",
    semanticReview: {
      ...assessment("x").semanticReview,
      changes: [
        {
          after: "delayed=(score:number)=>weight(score)",
          before:
            "delayed=(score:number)=>{if(score<0)throw new Error('negative');return score/2;}",
          file: "policy.ts",
          rationale: "Delegation retains rejection through shared weight",
        },
      ],
    },
  };

  assert.match(
    exercise(root, cli, "assess", review).errors.join(" "),
    /trust-boundary/u
  );

  const accepted = exercise(root, cli, "assess", {
    ...review,
    id: "preserved-boundary",
    semanticReview: {
      ...review.semanticReview,
      trustBoundaries: [
        {
          evidence:
            "Shared weight rejects negative input before applying policy; both callers executed",
          preserved: true,
          siteId: "delayed",
        },
      ],
    },
  });

  assert.equal(
    accepted.status,
    "awaiting-learning",
    JSON.stringify(accepted.errors)
  );
  assert.equal(accepted.tests.tests, 2);
});

test("disposable real weighting rehearsal preserves learning-state and delayed-check CLI outcomes with one authority", (t) => {
  const disposable = mkdtempSync(join(tmpdir(), "weighting-rehearsal-"));
  t.after(() => rmSync(disposable, { force: true, recursive: true }));
  cpSync(dirname(dirname(CLI)), join(disposable, "keepup"), {
    recursive: true,
  });
  const suite = join(disposable, "keepup/__tests__/cli.test.ts");

  const check = () => {
    const result = spawnSync(
      process.execPath,
      ["--test", "--test-reporter=tap", suite],
      {
        cwd: disposable,
        encoding: "utf-8",
        env: { ...process.env, NODE_TEST_CONTEXT: undefined },
      }
    );

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /pass 16/u);
  };

  check();
  const target = join(disposable, "keepup/scripts/keepup.ts");
  const original = readFileSync(target, "utf-8");
  const duplicated = 'event.phase === "post" ? 0.5 : 1';
  assert.equal(original.split(duplicated).length - 1, 2);

  const consolidated = original.replaceAll(
    duplicated,
    "quizWeight(event.phase)"
  );

  writeFileSync(
    target,
    `${consolidated}\nfunction quizWeight(phase: string | undefined): number { return phase === "post" ? 0.5 : 1; }\n`
  );
  check();
  assert.equal(
    readFileSync(target, "utf-8").split('phase === "post" ? 0.5 : 1').length -
      1,
    1
  );
});

function graphDefinition() {
  return {
    cycles: { dependency: "all", exceptions: [], id: "no-cycles" },
    dimension: "seam-integrity",
    evidence: ["policy.ts", "outside.ts", "behaviour.test.ts"],
    exclusions: [],
    id: "graph-baseline",
    limitations: [],
    modules: [
      { id: "learning", interface: ["policy.ts"], members: ["policy.ts"] },
      {
        id: "tests",
        interface: ["behaviour.test.ts"],
        members: ["behaviour.test.ts"],
      },
      { id: "other", interface: ["outside.ts"], members: ["outside.ts"] },
    ],
    rules: [
      {
        dependency: "all",
        from: "learning",
        id: "no-other",
        kind: "forbidden",
        to: "other",
      },
    ],
  };
}

function graphFixture(t: TestContext) {
  const { root, cli } = fixture(t);
  writeFileSync(join(root, "outside.ts"), "export const offset=0;\n");
  assert.equal(
    spawnSync("git", ["add", "outside.ts"], { cwd: root }).status,
    0
  );
  assert.equal(
    spawnSync("git", ["commit", "-qm", "independent graph subject"], {
      cwd: root,
    }).status,
    0
  );

  return { cli, root };
}

const graphGuard: ExerciseGuardrail = {
  assessmentId: "graph-baseline",
  kind: "forbidden-direction",
  ruleId: "no-other",
};

test(
  "reviewed locality preserves a selected complete graph guardrail and rejects a behaviour-preserving dependency regression",
  { skip: !process.env.KEEPUP_TEST_ANALYSER_DIRECTORY },
  (t) => {
    const { root, cli } = graphFixture(t);

    const graph = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(graphDefinition())
    );

    assert.equal(graph.analysis.status, "complete");

    const guards: readonly ExerciseGuardrail[] = [
      graphGuard,
      { ...graphGuard, kind: "prohibited-cycle", ruleId: "no-cycles" },
    ];

    const prepared = prepare(root, cli, guards);
    assert.equal(prepared.guardrails[0].baseline, 0);
    assert.equal(prepared.supportingAssessments[0].id, "graph-baseline");
    writeFileSync(join(root, "policy.ts"), after);
    run(
      root,
      cli,
      "architecture",
      "record",
      JSON.stringify(definition("candidate", true))
    );
    const accepted = exercise(root, cli, "assess", assessment("graph-pass"));
    assert.equal(
      accepted.status,
      "awaiting-learning",
      JSON.stringify(accepted.errors)
    );
    assert.equal(accepted.guardrails[0].current, 0);
    assert.equal(accepted.guardrails[1].current, 0);
    assert.equal(accepted.supportingAssessments[0].analysis.status, "complete");
    const bad = `import {offset} from './outside.ts';\n${after.replace("=>weight(score)", "=>weight(score)+offset")}`;
    writeFileSync(join(root, "policy.ts"), bad);
    run(
      root,
      cli,
      "architecture",
      "record",
      JSON.stringify(definition("regressed", true))
    );

    const rejected = exercise(root, cli, "assess", {
      ...assessment("graph-regression"),
      reviewedAssessmentId: "regressed",
    });

    assert.equal(rejected.status, "failed");
    assert.equal(rejected.tests.exitCode, 0);
    assert.equal(rejected.guardrails[0].current, 1);
    assert.match(rejected.errors.join(" "), /guardrail.*regressed/u);
    writeFileSync(join(root, "policy.ts"), after);
    run(
      root,
      cli,
      "architecture",
      "record",
      JSON.stringify(definition("graph-final", true))
    );

    const final = exercise(root, cli, "assess", {
      ...assessment("graph-final"),
      reviewedAssessmentId: "graph-final",
    });

    assert.equal(
      final.status,
      "awaiting-learning",
      JSON.stringify(final.errors)
    );
    const complete = completionInput(root, cli, final);
    assert.equal(exercise(root, cli, "complete", complete).state, "passed");
    const [toolAsset] = prepared.supportingAssessments[0].analysis.tool.assets;
    assert.ok(toolAsset);
    writeFileSync(
      join(root, ".keepup/architecture/snapshots", toolAsset.hash),
      "corrupt archived tool bytes"
    );

    const corrupt = execute(
      root,
      cli,
      "architecture",
      "exercise",
      "inspect",
      "locality",
      "--json"
    );

    assert.equal(corrupt.status, 1);
    assert.match(corrupt.stderr, /snapshot/u);
  }
);

function completionInput(
  root: string,
  cli: string,
  attempt: {
    readonly quizPrefix: string;
    readonly input: { readonly id: string };
  }
) {
  const postId = `${attempt.quizPrefix}answers`;
  run(
    root,
    cli,
    "log",
    JSON.stringify({
      answers: concepts.map((c, i) => ({
        ...c,
        answer: "Shared weight applies half the score",
        correct: true,
        question: `How does changed consumer preserve case ${i}?`,
      })),
      files: ["policy.ts"],
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
      files: ["policy.ts"],
      id: explainId,
      text: "Delayed and learning outcomes use the same authoritative half weighting; zero and partial scores remain unchanged.",
      type: "explain",
    })
  );

  const complete = {
    attemptId: attempt.input.id,
    exerciseId: "locality",
    explainId,
    id: "complete",
    invariantReview: [
      {
        evidence:
          "Existing positive zero and partial score checks plus source review",
        invariant: "Both consumers return half score",
        preserved: true,
      },
    ],
    postQuizIds: [postId],
  };

  return complete;
}

test(
  "reviewed graph guards reject missing, mismatched, stale and partial evidence while unrelated partial graphs do not block",
  { skip: !process.env.KEEPUP_TEST_ANALYSER_DIRECTORY },
  (t) => {
    const { root, cli } = graphFixture(t);

    const graph = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(graphDefinition())
    );

    assert.equal(graph.analysis.status, "complete");
    assert.throws(
      () =>
        prepare(root, cli, [
          { kind: "forbidden-direction", ruleId: "no-other" },
        ]),
      /explicit current complete supporting assessmentId/u
    );
    assert.throws(
      () => prepare(root, cli, [{ ...graphGuard, kind: "private-import" }]),
      /applicable/u
    );
    assert.throws(
      () => prepare(root, cli, [{ ...graphGuard, ruleId: "missing-rule" }]),
      /applicable/u
    );
    assert.throws(
      () =>
        prepare(root, cli, [
          { ...graphGuard, kind: "prohibited-cycle", ruleId: "missing-cycle" },
        ]),
      /existing frozen cycle policy/u
    );
    writeFileSync(
      join(root, "outside.ts"),
      "export const offset=0; // changed snapshot\n"
    );
    assert.throws(
      () => prepare(root, cli, [graphGuard], "stale-locality"),
      /exact prepared source/u
    );
    writeFileSync(
      join(root, "outside.ts"),
      "export const offset=0; export async function load(name:string) {return import(name);};\n"
    );

    const partial = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify({ ...graphDefinition(), id: "partial-graph" })
    );

    assert.equal(partial.analysis.status, "partial");
    assert.throws(
      () =>
        prepare(
          root,
          cli,
          [{ ...graphGuard, assessmentId: "partial-graph" }],
          "partial-locality"
        ),
      /complete deterministic seam analysis/u
    );
    const prepared = prepare(root, cli, [], "unrelated-partial");
    assert.equal(prepared.targetBaseline, 2);
    assert.equal(prepared.supportingAssessments, undefined);
  }
);

test(
  "supporting analyser mutation after exact graph assessment blocks the final practice writer",
  { skip: !process.env.KEEPUP_TEST_ANALYSER_DIRECTORY },
  (t) => {
    const { root, cli } = graphFixture(t);
    const tool = process.env.KEEPUP_TEST_ANALYSER_DIRECTORY;
    assert.ok(tool);
    const copied = join(root, ".keepup/fixture-analyser");
    cpSync(tool, copied, { recursive: true });

    const graph = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(graphDefinition())
    );

    assert.equal(graph.analysis.status, "complete");
    prepare(root, cli, [graphGuard]);
    writeFileSync(join(root, "policy.ts"), after);
    run(
      root,
      cli,
      "architecture",
      "record",
      JSON.stringify(definition("candidate", true))
    );
    const attempt = exercise(root, cli, "assess", assessment("graph-tool"));
    assert.equal(
      attempt.status,
      "awaiting-learning",
      JSON.stringify(attempt.errors)
    );
    const complete = completionInput(root, cli, attempt);
    const packagePath = join(copied, "node_modules/typescript/package.json");
    const original = readFileSync(packagePath, "utf-8");
    writeFileSync(packagePath, `${original}\n`);

    const rejected = execute(
      root,
      cli,
      "architecture",
      "exercise",
      "complete",
      JSON.stringify(complete)
    );

    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Supporting graph analyser assets/u);
    assert.equal(
      readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
        '"architecture_pass"'
      ),
      false
    );
  }
);

test(
  "deterministic seam preparation rejects a new supporting assessment reference rather than silently counting its original graph",
  { skip: !process.env.KEEPUP_TEST_ANALYSER_DIRECTORY },
  (t) => {
    const { root, cli } = graphFixture(t);
    writeFileSync(
      join(root, "policy.ts"),
      `import {offset} from './outside.ts';\n${before.replaceAll("=>score/2", "=>score/2+offset")}`
    );
    assert.equal(
      spawnSync("git", ["add", "policy.ts"], { cwd: root }).status,
      0
    );
    assert.equal(
      spawnSync("git", ["commit", "-qm", "existing dependency violation"], {
        cwd: root,
      }).status,
      0
    );

    const graph = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(graphDefinition())
    );

    assert.equal(graph.analysis.status, "complete");
    assert.equal(graph.analysis.findings.length, 1);

    const payload = {
      assessmentId: "graph-baseline",
      behaviour: "Preserve half-score outcomes",
      callers: ["behaviour.test.ts"],
      concepts,
      files: ["policy.ts"],
      guardrails: [{ ...graphGuard, assessmentId: "other-graph" }],
      id: "seam",
      invariants: ["Half score remains"],
      requiredTests: [
        {
          file: "behaviour.test.ts",
          name: "learning and delayed retain half weight",
        },
      ],
      stopCondition: "Stop on unknown evidence",
      target: {
        destination: "outside.ts",
        goal: 0,
        kind: "forbidden-direction",
        ruleId: "no-other",
        source: "policy.ts",
      },
      technique: "Repair original dependency",
      tradeoffs: [],
    };

    const result = execute(
      root,
      cli,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(payload)
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /supporting assessmentId is for reviewed targets only/u
    );
  }
);
