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

const before =
  "import {round} from './rounder.ts'; export const total=(amount:number)=>round(amount);\n";

const after =
  "export const total=(amount:number)=>{if(amount<0)throw new Error('negative');return Math.round(amount*100)/100;};\n";

const concepts = ["negative amount", "rounding policy", "module ownership"].map(
  (concept) => ({ concept, file: "entry.ts" })
);

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

function definition(id: string, improved = false): NavigabilityAssessmentInput {
  return {
    dimension: "navigability",
    evidence: ["entry.ts", "rounder.ts", "caller.ts"],
    exclusions: [],
    id,
    limitations: [
      "Unrelated dependency graph unavailable; seam safety unmeasured",
    ],
    module: { id: "orders", interface: ["entry.ts"], members: ["entry.ts"] },
    questions: [
      {
        disagreements: [],
        evidence: ["entry.ts", "rounder.ts"],
        id: "total-policy",
        namingIssues: [],
        owningModule: "orders",
        question:
          "Where and how does order total reject negative amounts and round cents?",
        readability: "coherent",
        readabilityExplanation:
          "Short public total states negative rejection and rounding without hidden caller duties",
        trail: [
          {
            file: "entry.ts",
            id: "entry",
            kind: "implementation",
            location: "total",
            moduleId: "orders",
            necessary: true,
            reason: "Public total owns the result",
          },
          {
            file: "rounder.ts",
            id: "round",
            kind: "implementation",
            location: "round",
            moduleId: "rounding",
            necessary: !improved,
            reason: improved
              ? "Owning total now contains sufficient validation and rounding implementation; legacy helper no longer needed for this question"
              : "Need round implementation to explain rejection and cents",
          },
        ],
        trailStatus: "complete",
      },
    ],
    review: {
      confidence: "high",
      notes:
        "Reviewed the complete sufficient implementation trail and caller interface",
      reviewer: "Fixture reviewer",
      status: "reviewed",
    },
  };
}

function preparation() {
  return {
    assessmentId: "baseline",
    behaviour:
      "Caller chooses amount; negative values rejected and cents rounded",
    callers: ["caller.ts", "behaviour.test.ts"],
    concepts,
    files: ["entry.ts"],
    guardrails: [],
    id: "navigation",
    invariants: [
      "Amount choice, negative rejection and rounding remain visible through same caller",
    ],
    requiredTests: [
      {
        file: "behaviour.test.ts",
        name: "total retains amount choice, rejection and cents",
      },
    ],
    stopCondition: "Stop if readability or caller obligations worsen",
    target: { goal: 0, kind: "navigability", questionId: "total-policy" },
    technique: "Make total policy visible at its owner",
    tradeoffs: [
      "Legacy rounding helper remains for other consumers; no locality improvement claimed",
    ],
  };
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "navigation-exercise-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "entry.ts"), before);
  writeFileSync(
    join(root, "rounder.ts"),
    "export const round=(amount:number)=>{if(amount<0)throw new Error('negative');return Math.round(amount*100)/100;};\n"
  );
  writeFileSync(
    join(root, "caller.ts"),
    "import {total} from './entry.ts'; export const receipt=(amount:number)=>total(amount);\n"
  );
  writeFileSync(
    join(root, "behaviour.test.ts"),
    "import test from 'node:test';import assert from 'node:assert/strict';import {receipt} from './caller.ts';import {round} from './rounder.ts';test('total retains amount choice, rejection and cents',()=>{assert.equal(receipt(7.126),7.13);assert.equal(receipt(0),0);assert.throws(()=>receipt(-1),/negative/u);assert.equal(round(7.126),7.13);});\n"
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

function start(root: string, cli: string) {
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("baseline"))
  );
  const prepared = exercise(root, cli, "prepare", preparation());
  const id = `${prepared.quizPrefix}answers`;
  run(
    root,
    cli,
    "log",
    JSON.stringify({
      answers: concepts.map((concept, i) => ({
        ...concept,
        answer: "Trace the external round implementation",
        correct: true,
        question: `Where does baseline total establish fact ${i}?`,
      })),
      files: ["entry.ts"],
      id,
      phase: "pre",
      type: "quiz",
    })
  );
  exercise(root, cli, "start", {
    exerciseId: "navigation",
    id: "start",
    preQuizIds: [id],
  });

  return prepared;
}

function assessment(id: string, reviewedAssessmentId = "candidate") {
  return {
    attribution: [{ author: "learner", file: "entry.ts" }],
    exerciseId: "navigation",
    id,
    reason: "Actual learner confirms ownership refactor",
    reviewedAssessmentId,
    semanticReview: {
      callers: [
        {
          excerpt: "receipt=(amount:number)=>total(amount)",
          file: "caller.ts",
          rationale:
            "Same single operation and amount choice; no internal implementation obligations transferred",
        },
        {
          excerpt: "assert.throws(()=>receipt(-1),/negative/u)",
          file: "behaviour.test.ts",
          rationale:
            "Same positive/negative behaviour through unchanged caller",
        },
      ],
      changes: [
        {
          after: after.trim(),
          before: before.trim(),
          file: "entry.ts",
          rationale: "Rejection and rounding are explicit at total owner",
        },
      ],
      rationale:
        "The exact frozen question now needs only the short owning total implementation; legacy round step remains inventoried but is unnecessary. Internal readability and useful caller interface remain coherent.",
      reviewer: "Fixture reviewer",
      status: "reviewed",
      trustBoundaries: [],
    },
  };
}

function improve(root: string, cli: string, id = "candidate") {
  writeFileSync(join(root, "entry.ts"), after);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition(id, true))
  );
}

function learning(
  root: string,
  cli: string,
  attempt: { quizPrefix: string; input: { id: string } }
) {
  const postId = `${attempt.quizPrefix}answers`;
  run(
    root,
    cli,
    "log",
    JSON.stringify({
      answers: concepts.map((concept, i) => ({
        ...concept,
        answer:
          "Owner now states validation and rounding; callers still choose amount",
        correct: true,
        question: `Why does final total itself establish fact ${i}?`,
      })),
      files: ["entry.ts"],
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
      files: ["entry.ts"],
      id: explainId,
      text: "The total owner now states negative rejection and cents rounding in its short implementation. The unchanged caller chooses amount through one operation, so fewer module transitions do not hide obligations or unreadable code.",
      type: "explain",
    })
  );

  return {
    attemptId: attempt.input.id,
    exerciseId: "navigation",
    explainId,
    id: "complete",
    invariantReview: [
      {
        evidence:
          "Inspected short owning implementation, unchanged caller and executed existing positive/negative suite",
        invariant:
          "Amount choice, negative rejection and rounding remain visible through same caller",
        preserved: true,
      },
    ],
    postQuizIds: [postId],
  };
}

test("copied navigability journey shortens the same sufficient logical-module trail with coherent ownership and one practice event", (t) => {
  const { root, cli } = fixture(t);
  start(root, cli);
  improve(root, cli);
  const attempt = exercise(root, cli, "assess", assessment("assessed"));
  assert.equal(
    attempt.status,
    "awaiting-learning",
    JSON.stringify(attempt.errors)
  );
  assert.equal(attempt.target.baseline, 1);
  assert.equal(attempt.target.current, 0);
  assert.equal(
    readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
      '"architecture_pass"'
    ),
    false
  );
  const completion = learning(root, cli, attempt);
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

test("navigation rejects metadata, easier questions, dropped steps, recategorised trails and membership laundering", (t) => {
  const { root, cli } = fixture(t);
  const prepared = start(root, cli);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("candidate", true))
  );
  assert.match(
    exercise(root, cli, "assess", assessment("metadata")).errors.join(" "),
    /No attributable source/u
  );
  improve(root, cli, "genuine");
  const base = definition("changed-question", true);

  const changedQuestion = {
    ...base,
    questions: base.questions.map((question) => ({
      ...question,
      question: "Where is the entrypoint?",
    })),
  };

  run(root, cli, "architecture", "record", JSON.stringify(changedQuestion));
  assert.match(
    exercise(
      root,
      cli,
      "assess",
      assessment("easier", "changed-question")
    ).errors.join(" "),
    /Exact comprehension question/u
  );

  const dropped = {
    ...definition("dropped", true),
    questions: definition("dropped", true).questions.map((question) => ({
      ...question,
      trail: question.trail.slice(0, 1),
    })),
  };

  run(root, cli, "architecture", "record", JSON.stringify(dropped));
  assert.match(
    exercise(root, cli, "assess", assessment("dropped", "dropped")).errors.join(
      " "
    ),
    /trail sites cannot be omitted/u
  );

  const classified = {
    ...definition("classified", true),
    questions: definition("classified", true).questions.map((question) => ({
      ...question,
      trail: question.trail.map((step) =>
        step.id === "round" ? { ...step, kind: "private-helper" } : step
      ),
    })),
  };

  run(root, cli, "architecture", "record", JSON.stringify(classified));
  assert.match(
    exercise(
      root,
      cli,
      "assess",
      assessment("classified", "classified")
    ).errors.join(" "),
    /recategorised/u
  );
  const membership = definition("membership", true);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify({
      ...membership,
      module: {
        ...membership.module,
        members: [...membership.module.members, "rounder.ts"],
      },
    })
  );
  assert.match(
    exercise(
      root,
      cli,
      "assess",
      assessment("membership", "membership")
    ).errors.join(" "),
    /logical module membership/u
  );
  const evidence = definition("evidence", true);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify({
      ...evidence,
      questions: evidence.questions.map((question) => ({
        ...question,
        evidence: ["entry.ts"],
      })),
    })
  );
  assert.match(
    exercise(
      root,
      cli,
      "assess",
      assessment("evidence", "evidence")
    ).errors.join(" "),
    /sufficient source evidence/u
  );

  const roundingSource = readFileSync(join(root, "rounder.ts"), "utf-8");
  rmSync(join(root, "rounder.ts"));
  assert.match(
    exercise(
      root,
      cli,
      "assess",
      assessment("physical-merge", "genuine")
    ).errors.join(" "),
    /Added, deleted or missing|modes changed/u
  );
  writeFileSync(join(root, "rounder.ts"), roundingSource);

  const context = run(
    root,
    cli,
    "architecture",
    "exercise",
    "inspect",
    "navigation",
    "--json"
  );

  assert.deepEqual(context.preparation, prepared);
  assert.equal(context.pass, null);
});

test("navigation requires sufficient readable ownership and cannot move work into frozen callers", (t) => {
  const { root, cli } = fixture(t);
  start(root, cli);
  improve(root, cli);

  for (const { id, readability, trailStatus } of [
    {
      id: "giant",
      readability: "consolidation-obscures",
      trailStatus: "complete",
    },
    { id: "unclear", readability: "unclear", trailStatus: "complete" },
    { id: "incomplete", readability: "coherent", trailStatus: "incomplete" },
  ]) {
    const source =
      id === "giant"
        ? `${after}${Array.from({ length: 100 }, (_, index) => `export const unrelated${index}=()=>${index};`).join("\n")}\n`
        : after;

    writeFileSync(join(root, "entry.ts"), source);
    const current = definition(id, true);
    run(
      root,
      cli,
      "architecture",
      "record",
      JSON.stringify({
        ...current,
        questions: current.questions.map((question) => ({
          ...question,
          readability,
          readabilityExplanation:
            "Actual reviewed trail quality and sufficiency remains unresolved",
          trailStatus,
        })),
      })
    );
    assert.match(
      exercise(root, cli, "assess", assessment(id, id)).errors.join(" "),
      /Incomplete\/disputed trails/u
    );
  }

  const disputed = definition("disputed", true);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify({
      ...disputed,
      questions: disputed.questions.map((question) => ({
        ...question,
        disagreements: [
          "Reviewer still needs external implementation to establish invariant",
        ],
      })),
    })
  );
  assert.match(
    exercise(
      root,
      cli,
      "assess",
      assessment("disputed", "disputed")
    ).errors.join(" "),
    /Incomplete\/disputed trails/u
  );
  const owner = definition("owner", true);
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify({
      ...owner,
      questions: owner.questions.map((question) => ({
        ...question,
        owningModule: null,
      })),
    })
  );
  assert.match(
    exercise(root, cli, "assess", assessment("owner", "owner")).errors.join(
      " "
    ),
    /owning module/u
  );
  writeFileSync(
    join(root, "caller.ts"),
    "import {total} from './entry.ts'; export const receipt=(amount:number)=>{if(amount<0)throw new Error('negative');return total(amount);};\n"
  );

  const shifted = {
    ...assessment("shifted"),
    attribution: [
      { author: "learner", file: "caller.ts" },
      { author: "learner", file: "entry.ts" },
    ],
  };

  assert.match(
    exercise(root, cli, "assess", shifted).errors.join(" "),
    /Out-of-scope/u
  );
  assert.equal(
    readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
      '"architecture_pass"'
    ),
    false
  );
});

test("renaming pass-throughs without shorter trails, stale source, lost validation and agent authorship cannot receive navigation practice", (t) => {
  const { root, cli } = fixture(t);
  start(root, cli);

  const alias =
    "import {round as cents} from './rounder.ts'; export const total=(amount:number)=>cents(amount);\n";

  writeFileSync(join(root, "entry.ts"), alias);
  run(root, cli, "architecture", "record", JSON.stringify(definition("alias")));
  const renamed = assessment("alias", "alias");
  renamed.semanticReview.changes = [
    {
      after: alias.trim(),
      before: before.trim(),
      file: "entry.ts",
      rationale:
        "Only renamed pass-through; necessary trail still crosses rounding module",
    },
  ];
  assert.match(
    exercise(root, cli, "assess", renamed).errors.join(" "),
    /did not improve/u
  );
  improve(root, cli);

  const agent = {
    ...assessment("agent"),
    attribution: [{ author: "agent", file: "entry.ts" }],
  };

  assert.match(
    exercise(root, cli, "assess", agent).errors.join(" "),
    /attribution/u
  );
  writeFileSync(
    join(root, "entry.ts"),
    after.replace("if(amount<0)throw new Error('negative');", "")
  );
  run(
    root,
    cli,
    "architecture",
    "record",
    JSON.stringify(definition("unvalidated", true))
  );
  assert.match(
    exercise(
      root,
      cli,
      "assess",
      assessment("unvalidated", "unvalidated")
    ).errors.join(" "),
    /test command did not complete/u
  );
  writeFileSync(join(root, "entry.ts"), `${after}// still changed\n`);
  assert.match(
    exercise(root, cli, "assess", assessment("stale")).errors.join(" "),
    /exact current candidate/u
  );

  const abandoned = exercise(root, cli, "abandon", {
    exerciseId: "navigation",
    id: "abandon",
    reason: "Learner preserves source and changes direction",
  });

  assert.equal(abandoned.state, "abandoned");
  assert.match(readFileSync(join(root, "entry.ts"), "utf-8"), /still changed/u);
});
