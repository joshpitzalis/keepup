import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));
const TOOL = process.env.KEEPUP_TEST_ANALYSER_DIRECTORY;

function execute(root: string, cli: string, ...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, KEEPUP_ANALYSER_DIRECTORY: TOOL },
  });
}

function run(root: string, cli: string, ...args: string[]) {
  const result = execute(root, cli, ...args);
  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

function fixture(t: TestContext): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "architecture-exercise-"))
  );

  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "private.ts"), "export const secret = 7;\n");
  writeFileSync(join(root, "public.ts"), "export const save = () => 7;\n");
  writeFileSync(
    join(root, "caller.ts"),
    "import { secret } from './private.ts'; export const run = () => secret;\n"
  );
  writeFileSync(
    join(root, "behaviour.test.ts"),
    "import assert from 'node:assert/strict'; import test from 'node:test'; import {run} from './caller.ts'; test('public caller retains save value', () => assert.equal(run(), 7));\n"
  );
  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);
  assert.equal(
    spawnSync("git", ["commit", "-qm", "fixture"], { cwd: root }).status,
    0
  );
  writeFileSync(
    join(root, "empty.test.ts"),
    "// No registered behavioural cases\n"
  );
  writeFileSync(
    join(root, "skip.test.ts"),
    "import test from 'node:test'; test('skipped behaviour', {skip:true}, () => {});\n"
  );
  writeFileSync(
    join(root, "decoy.test.ts"),
    "import test from 'node:test'; test('same case name', () => {});\n"
  );
  assert.equal(
    spawnSync(
      "git",
      ["add", "empty.test.ts", "skip.test.ts", "decoy.test.ts"],
      { cwd: root }
    ).status,
    0
  );
  assert.equal(
    spawnSync("git", ["commit", "-qm", "runner coverage fixtures"], {
      cwd: root,
    }).status,
    0
  );
  run(root, CLI, "init");
  const config = join(root, ".keepup/config.json");
  writeFileSync(
    config,
    JSON.stringify({
      ...JSON.parse(readFileSync(config, "utf-8")),
      testCommand: "node --test --test-reporter=tap behaviour.test.ts",
    })
  );
  run(
    root,
    CLI,
    "architecture",
    "analyse",
    JSON.stringify({
      dimension: "seam-integrity",
      evidence: [],
      exclusions: [],
      id: "seams",
      limitations: [],
      modules: [
        {
          id: "caller",
          interface: ["caller.ts"],
          members: ["caller.ts", "behaviour.test.ts"],
        },
        {
          id: "orders",
          interface: ["public.ts"],
          members: ["public.ts", "private.ts"],
        },
      ],
      rules: [
        {
          dependency: "all",
          from: "caller",
          id: "caller-orders",
          kind: "public-only",
          to: "orders",
        },
      ],
    })
  );

  return root;
}

function preparation(id: string) {
  return {
    assessmentId: "seams",
    behaviour: "The caller still returns the saved value",
    callers: ["behaviour.test.ts"],
    concepts: [
      { concept: "public boundary", file: "caller.ts" },
      { concept: "returned behaviour", file: "caller.ts" },
      { concept: "failure impact", file: "caller.ts" },
    ],
    files: ["caller.ts"],
    guardrails: [{ kind: "private-import", ruleId: "caller-orders" }],
    id,
    invariants: ["Caller run returns 7"],
    requiredTests: [
      { file: "behaviour.test.ts", name: "public caller retains save value" },
    ],
    stopCondition:
      "Stop if existing behaviour or the public interface contract changes",
    target: {
      destination: "private.ts",
      goal: 0,
      kind: "private-import",
      ruleId: "caller-orders",
      source: "caller.ts",
    },
    technique: "Route caller through the declared interface",
    tradeoffs: [],
  };
}

function quiz(root: string, cli: string, prepared: { quizPrefix: string }) {
  const id = `${prepared.quizPrefix}answered`;
  run(
    root,
    cli,
    "log",
    JSON.stringify({
      answers: preparation("ignored").concepts.map((concept, index) => ({
        ...concept,
        answer: "The declared public interface owns the outcome",
        correct: index !== 0,
        question: `Actual fixture question ${index + 1}: which boundary owns this value?`,
      })),
      files: ["caller.ts"],
      id,
      phase: "pre",
      type: "quiz",
    })
  );

  return id;
}

test(
  "reviewed consolidation and physical module merge retain logical obligations, reject vanished guards and out-of-scope or concurrent source",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    writeFileSync(join(root, "private-extra.ts"), "export const extra=0;\n");
    writeFileSync(
      join(root, "private.ts"),
      "export const secret=7; export const validate=(value:number)=>{if(value<0){throw new Error('negative');}return value;};\n"
    );
    writeFileSync(
      join(root, "public.ts"),
      "import {secret,validate} from './private.ts'; export const save=(value=secret)=>validate(value);\n"
    );
    const behaviour = readFileSync(join(root, "behaviour.test.ts"), "utf-8");
    writeFileSync(
      join(root, "behaviour.test.ts"),
      `${behaviour}import {save} from './public.ts'; test('negative values stay rejected',()=>assert.throws(()=>save(-1),/negative/u)); import {existsSync,readFileSync,writeFileSync} from 'node:fs'; if(existsSync('.keepup/reshape-drift')){writeFileSync('combined.ts',readFileSync('combined.ts','utf-8')+'// concurrent change\\n');}\n`
    );
    assert.equal(
      spawnSync(
        "git",
        [
          "add",
          "private.ts",
          "public.ts",
          "private-extra.ts",
          "behaviour.test.ts",
        ],
        {
          cwd: root,
        }
      ).status,
      0
    );
    assert.equal(
      spawnSync("git", ["commit", "-qm", "complete consolidation fixture"], {
        cwd: root,
      }).status,
      0
    );

    const original = run(
      root,
      CLI,
      "architecture",
      "inspect",
      "seams",
      "--json"
    ).assessment.input;

    run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify({
        ...original,
        id: "consolidation",
        modules: original.modules.map(
          (module: { id: string; members: string[] }) =>
            module.id === "orders"
              ? { ...module, members: [...module.members, "private-extra.ts"] }
              : module
        ),
      })
    );

    const concepts = preparation("unused").concepts.map((concept) => ({
      ...concept,
      file: "private.ts",
    }));

    const transformation = {
      concepts: concepts.map((before) => ({
        after: { ...before, file: "combined.ts" },
        before,
      })),
      files: [
        {
          after: ["combined.ts"],
          before: ["private.ts", "private-extra.ts"],
          logicalModule: "orders",
        },
      ],
      modules: [
        {
          after: [
            {
              id: "merged-physical",
              interface: ["caller.ts", "public.ts"],
              members: [
                "caller.ts",
                "behaviour.test.ts",
                "public.ts",
                "combined.ts",
              ],
            },
          ],
          before: ["caller", "orders"],
        },
      ],
      review: {
        notes:
          "Consolidate equivalent private implementations, retain original caller/orders logical policy roles inside a physical module merge.",
        reviewer: "Fixture learner",
        status: "reviewed",
      },
    };

    const input = {
      ...preparation("merge"),
      assessmentId: "consolidation",
      concepts,
      files: ["caller.ts", "private.ts", "private-extra.ts", "public.ts"],
      invariants: ["Caller run returns 7", "Negative values are rejected"],
      requiredTests: [
        ...preparation("unused").requiredTests,
        { file: "behaviour.test.ts", name: "negative values stay rejected" },
      ],
      transformation,
    };

    const invalid = [
      {
        ...input,
        id: "cross-role",
        transformation: {
          ...transformation,
          files: [
            {
              after: ["combined.ts"],
              before: ["caller.ts", "private.ts"],
              logicalModule: "orders",
            },
          ],
        },
      },
      {
        ...input,
        id: "vanished",
        transformation: {
          ...transformation,
          files: [
            { after: [], before: ["private.ts"], logicalModule: "orders" },
          ],
        },
      },
      {
        ...input,
        id: "promoted",
        transformation: {
          ...transformation,
          files: [
            {
              after: ["public.ts"],
              before: ["private.ts"],
              logicalModule: "orders",
            },
          ],
        },
      },
      {
        ...input,
        id: "outside",
        transformation: {
          ...transformation,
          files: [
            {
              after: ["../outside.ts"],
              before: ["private.ts"],
              logicalModule: "orders",
            },
          ],
        },
      },
    ];

    for (const candidate of invalid) {
      assert.equal(
        execute(
          root,
          CLI,
          "architecture",
          "exercise",
          "prepare",
          JSON.stringify(candidate)
        ).status,
        1
      );
    }

    const prepared = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(input)
    );

    const preId = `${prepared.quizPrefix}actual`;
    run(
      root,
      CLI,
      "log",
      JSON.stringify({
        answers: concepts.map((concept, index) => ({
          ...concept,
          answer: "The original private role and behaviour must survive",
          correct: true,
          question: `Actual consolidation question ${index + 1}`,
        })),
        files: ["private.ts"],
        id: preId,
        phase: "pre",
        type: "quiz",
      })
    );
    run(
      root,
      CLI,
      "architecture",
      "exercise",
      "start",
      JSON.stringify({ exerciseId: "merge", id: "start", preQuizIds: [preId] })
    );
    rmSync(join(root, "private.ts"));
    rmSync(join(root, "private-extra.ts"));
    writeFileSync(join(root, "combined.ts"), "export const secret=7;\n");
    const attribution = ["private.ts", "private-extra.ts", "combined.ts"];

    const unresolved = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(assessmentInput("merge", "unresolved", attribution))
    );

    assert.equal(unresolved.status, "failed");
    assert.equal(unresolved.target.current, null);
    writeFileSync(
      join(root, "caller.ts"),
      "import {save} from './public.ts'; export const run=()=>save();\n"
    );
    writeFileSync(
      join(root, "public.ts"),
      "import {secret} from './combined.ts'; export const save=()=>secret;\n"
    );
    const files = [...attribution, "caller.ts", "public.ts"];

    const guard = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(assessmentInput("merge", "removed-guard", files))
    );

    assert.equal(guard.status, "failed");
    assert.equal(guard.target.current, null);
    assert.match(guard.errors.join(" "), /test command did not complete/u);
    writeFileSync(
      join(root, "combined.ts"),
      "export const secret=7; export const validate=(value:number)=>{if(value<0){throw new Error('negative');}return value;};\n"
    );
    writeFileSync(
      join(root, "public.ts"),
      "import {secret,validate} from './combined.ts'; export const save=(value=secret)=>validate(value);\n"
    );
    const requiredBytes = readFileSync(join(root, "behaviour.test.ts"));
    rmSync(join(root, "behaviour.test.ts"));

    const vanishedTest = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(
        assessmentInput("merge", "vanished-test", [
          ...files,
          "behaviour.test.ts",
        ])
      )
    );

    assert.equal(vanishedTest.status, "failed");
    assert.equal(vanishedTest.target.current, null);
    writeFileSync(join(root, "behaviour.test.ts"), requiredBytes);

    writeFileSync(join(root, "outside.ts"), "export const hidden=1;\n");

    const outside = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(
        assessmentInput("merge", "outside", [...files, "outside.ts"])
      )
    );

    assert.equal(outside.status, "failed");
    assert.match(outside.errors.join(" "), /untracked|out-of-scope/u);
    rmSync(join(root, "outside.ts"));
    writeFileSync(join(root, ".keepup/reshape-drift"), "armed");

    const concurrent = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(assessmentInput("merge", "concurrent", files))
    );

    assert.equal(concurrent.status, "failed");
    assert.match(concurrent.errors.join(" "), /changed during assessment/u);
    rmSync(join(root, ".keepup/reshape-drift"));
    assert.equal(
      spawnSync("git", ["add", "--all", "--", ...files], { cwd: root }).status,
      0
    );

    const final = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(assessmentInput("merge", "final", files))
    );

    assert.equal(final.status, "awaiting-learning", JSON.stringify(final));
    assert.equal(final.target.current, 0);
    assert.deepEqual(
      final.assessment.input.modules.map((module: { id: string }) => module.id),
      ["caller", "orders"]
    );

    const comparison = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "compare",
      "merge",
      "final"
    );

    assert.equal(comparison.comparable, true);
    assert.equal(comparison.mapping.modules[0].after[0].id, "merged-physical");
    assert.equal(comparison.target.baseline, 1);
    assert.equal(comparison.target.current, 0);

    const report = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "report",
      "merge",
      "--no-open"
    );

    assert.match(
      readFileSync(report.path, "utf-8"),
      /merged-physical|Frozen reviewed transformation/u
    );
  }
);

test(
  "declared new internal implementation is visible untracked without widening its original logical public interface",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const { concepts } = preparation("unused");

    const transformation = {
      concepts: concepts.map((before) => ({ after: before, before })),
      files: [{ after: ["helper.ts"], before: [], logicalModule: "orders" }],
      modules: [
        {
          after: [
            {
              id: "caller",
              interface: ["caller.ts"],
              members: ["caller.ts", "behaviour.test.ts"],
            },
          ],
          before: ["caller"],
        },
        {
          after: [
            {
              id: "orders",
              interface: ["public.ts"],
              members: ["public.ts", "private.ts", "helper.ts"],
            },
          ],
          before: ["orders"],
        },
      ],
      review: {
        notes:
          "New implementation stays private under the existing orders policy and original caller behaviour.",
        reviewer: "Fixture learner",
        status: "reviewed",
      },
    };

    const input = {
      ...preparation("new-internal"),
      files: ["caller.ts", "public.ts"],
      transformation,
    };

    const prepared = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(input)
    );

    const pre = quiz(root, CLI, prepared);
    run(
      root,
      CLI,
      "architecture",
      "exercise",
      "start",
      JSON.stringify({ exerciseId: input.id, id: "start", preQuizIds: [pre] })
    );
    writeFileSync(
      join(root, "helper.ts"),
      "import {secret} from './private.ts'; export const output=()=>secret;\n"
    );
    writeFileSync(
      join(root, "caller.ts"),
      "import {output} from './helper.ts'; export const run=()=>output();\n"
    );

    const bad = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(
        assessmentInput(input.id, "private-helper", ["caller.ts", "helper.ts"])
      )
    );

    assert.equal(bad.target.current, 1);
    assert.equal(bad.status, "failed");
    assert.ok(bad.assessment.analysis.analysedFiles.includes("helper.ts"));
    writeFileSync(
      join(root, "caller.ts"),
      "import {save} from './public.ts'; export const run=()=>save();\n"
    );
    writeFileSync(
      join(root, "public.ts"),
      "import {output} from './helper.ts'; export const save=()=>output();\n"
    );

    const good = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(
        assessmentInput(input.id, "public-contract", [
          "caller.ts",
          "helper.ts",
          "public.ts",
        ])
      )
    );

    assert.equal(good.status, "awaiting-learning", JSON.stringify(good));
    assert.equal(good.target.current, 0);
    assert.equal(good.tracking, false);

    const comparison = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "compare",
      input.id,
      "public-contract"
    );

    assert.equal(comparison.comparable, true);
    assert.deepEqual(
      comparison.after.input.modules.find(
        (module: { id: string }) => module.id === "orders"
      ).interface,
      ["public.ts"]
    );
  }
);

test(
  "transformation preparation rejects ignored, pre-existing, generated, symlinked and out-of-scope new paths and moved required tests",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const configPath = join(root, ".keepup/config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    writeFileSync(
      configPath,
      JSON.stringify({ ...config, exclude: [...config.exclude, "outside/**"] })
    );
    writeFileSync(join(root, ".git/info/exclude"), "ignored-helper.ts\n");
    writeFileSync(join(root, "already.ts"), "export const existing=1;\n");
    symlinkSync(root, join(root, "alias"), "dir");
    const { concepts } = preparation("unused");

    for (const [id, path, reason] of [
      ["ignored", "ignored-helper.ts", /ignored/u],
      ["existing", "already.ts", /already exist/u],
      ["generated", "dist/helper.ts", /generated/u],
      ["symlink", "alias/helper.ts", /Symlinked/u],
      ["excluded", "outside/helper.ts", /outside.*scope/u],
    ] as const) {
      const transformation = {
        concepts: concepts.map((before) => ({ after: before, before })),
        files: [{ after: [path], before: [], logicalModule: "orders" }],
        modules: [
          {
            after: [
              {
                id: "caller",
                interface: ["caller.ts"],
                members: ["caller.ts", "behaviour.test.ts"],
              },
            ],
            before: ["caller"],
          },
          {
            after: [
              {
                id: "orders",
                interface: ["public.ts"],
                members: ["public.ts", "private.ts", path],
              },
            ],
            before: ["orders"],
          },
        ],
        review: {
          notes:
            "Actual bounded same-role addition with unchanged policies and behaviour",
          reviewer: "Fixture learner",
          status: "reviewed",
        },
      };

      const rejected = execute(
        root,
        CLI,
        "architecture",
        "exercise",
        "prepare",
        JSON.stringify({ ...preparation(id), transformation })
      );

      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, reason);
    }

    const transformedTest = {
      concepts: concepts.map((before) => ({ after: before, before })),
      files: [
        {
          after: ["checks.ts"],
          before: ["behaviour.test.ts"],
          logicalModule: "caller",
        },
      ],
      modules: [
        {
          after: [
            {
              id: "caller",
              interface: ["caller.ts"],
              members: ["caller.ts", "checks.ts"],
            },
          ],
          before: ["caller"],
        },
        {
          after: [
            {
              id: "orders",
              interface: ["public.ts"],
              members: ["public.ts", "private.ts"],
            },
          ],
          before: ["orders"],
        },
      ],
      review: {
        notes:
          "A moved test must not be accepted as original frozen behaviour evidence",
        reviewer: "Fixture learner",
        status: "reviewed",
      },
    };

    const missingGuard = execute(
      root,
      CLI,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify({
        ...preparation("move-tests"),
        files: ["caller.ts", "behaviour.test.ts"],
        transformation: transformedTest,
      })
    );

    assert.equal(missingGuard.status, 1);
    assert.match(missingGuard.stderr, /behavioural tests.*cannot be moved/u);
    assert.deepEqual(run(root, CLI, "architecture", "exercise", "list"), []);
  }
);

function concurrentExercise(
  root: string,
  cli: string,
  command: string,
  input: ReturnType<typeof linkedLearning>
): Promise<string> {
  // oxlint-disable-next-line promise/avoid-new -- Public processes verify the real shared lock and immutable retries.
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cli, "architecture", "exercise", command, JSON.stringify(input)],
      { cwd: root, env: { ...process.env, KEEPUP_ANALYSER_DIRECTORY: TOOL } }
    );

    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code) {
        reject(new Error(errors));
      } else {
        resolve(output);
      }
    });
  });
}

function startSubmissionFixture(
  root: string,
  id: string,
  input = preparation(id)
) {
  const prepared = run(
    root,
    CLI,
    "architecture",
    "exercise",
    "prepare",
    JSON.stringify(input)
  );

  const pre = quiz(root, CLI, prepared);
  run(
    root,
    CLI,
    "architecture",
    "exercise",
    "start",
    JSON.stringify({ exerciseId: id, id: "start", preQuizIds: [pre] })
  );

  return prepared;
}

function assessmentInput(
  exerciseId: string,
  id: string,
  files = ["caller.ts"]
) {
  return {
    attribution: files.map((file) => ({ author: "learner", file })),
    exerciseId,
    id,
    reason: "Actual fixture learner confirms each changed file",
  };
}

function linkedLearning(
  root: string,
  exerciseId: string,
  attempt: { quizPrefix: string; input: { id: string } }
) {
  const postId = `${attempt.quizPrefix}answers`;
  run(
    root,
    CLI,
    "log",
    JSON.stringify({
      answers: preparation("unused").concepts.map((concept, index) => ({
        ...concept,
        answer: "The public contract preserves seven",
        correct: true,
        question: `New actual trace question ${index + 1}`,
      })),
      files: ["caller.ts"],
      id: postId,
      phase: "post",
      type: "quiz",
    })
  );
  const explainId = `${attempt.quizPrefix}explain`;
  run(
    root,
    CLI,
    "log",
    JSON.stringify({
      files: ["caller.ts"],
      id: explainId,
      text: "The public entrypoint preserves the saved value. The existing behaviour test and reviewed validation diff retain the original contract.",
      type: "explain",
    })
  );

  return {
    attemptId: attempt.input.id,
    exerciseId,
    explainId,
    id: "accept",
    invariantReview: [
      {
        evidence:
          "Actual learner reviewed the invariant, validation diff and unchanged existing test.",
        invariant: "Caller run returns 7",
        preserved: true,
      },
    ],
    postQuizIds: [postId],
  };
}

test(
  "copied reshape preserves a renamed private policy role, analyses new untracked implementation and completes only with staged mapped actual learning",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const installed = join(root, "installed");
    cpSync(dirname(dirname(CLI)), installed, { recursive: true });
    const cli = join(installed, "scripts/keepup.mjs");
    chmodSync(join(root, ".keepup/scorers/complexity"), 0o644);

    const oldQuestion = {
      answer: "The private orders implementation retains the value",
      concept: "prior private contract",
      correct: true,
      file: "private.ts",
      question: "Actual historical private boundary question",
    };

    for (const [id, phase, days] of [
      ["historical-private-pre", "pre", 4],
      ["historical-private-check", "check", 2],
    ] as const) {
      const recorded = spawnSync(
        process.execPath,
        [
          cli,
          "log",
          JSON.stringify({
            answers: [oldQuestion],
            files: ["private.ts"],
            id,
            phase,
            type: "quiz",
          }),
        ],
        {
          cwd: root,
          encoding: "utf-8",
          env: {
            ...process.env,
            KEEPUP_ANALYSER_DIRECTORY: TOOL,
            KEEPUP_NOW: new Date(
              Date.now() - days * 24 * 60 * 60 * 1000
            ).toISOString(),
          },
        }
      );

      assert.equal(recorded.status, 0, recorded.stderr);
    }

    assert.equal(
      run(root, cli, "status", "--json").files.find(
        (entry: { file: string }) => entry.file === "private.ts"
      ).state,
      "verified"
    );

    const concepts = preparation("unused").concepts.map((concept) => ({
      ...concept,
      file: "private.ts",
    }));

    const transformation = {
      concepts: concepts.map((before) => ({
        after: { ...before, file: "internal.ts" },
        before,
      })),
      files: [
        {
          after: ["internal.ts"],
          before: ["private.ts"],
          logicalModule: "orders",
        },
      ],
      modules: [
        {
          after: [
            {
              id: "caller",
              interface: ["caller.ts"],
              members: ["caller.ts", "behaviour.test.ts"],
            },
          ],
          before: ["caller"],
        },
        {
          after: [
            {
              id: "orders-door",
              interface: ["public.ts"],
              members: ["public.ts"],
            },
            {
              id: "orders-core",
              interface: ["internal.ts"],
              members: ["internal.ts"],
            },
          ],
          before: ["orders"],
        },
      ],
      review: {
        notes:
          "Physical split retains original orders policy ownership and caller outcome; no private surface promotion.",
        reviewer: "Fixture learner",
        status: "reviewed",
      },
    };

    const input = {
      ...preparation("reshape"),
      concepts,
      files: ["caller.ts", "private.ts", "public.ts"],
      transformation,
    };

    const prepared = run(
      root,
      cli,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(input)
    );

    const preId = `${prepared.quizPrefix}actual`;
    run(
      root,
      cli,
      "log",
      JSON.stringify({
        answers: concepts.map((concept, index) => ({
          ...concept,
          answer: "The orders role keeps this implementation private",
          correct: true,
          question: `Actual old implementation impact question ${index + 1}`,
        })),
        files: ["private.ts"],
        id: preId,
        phase: "pre",
        type: "quiz",
      })
    );
    run(
      root,
      cli,
      "architecture",
      "exercise",
      "start",
      JSON.stringify({
        exerciseId: "reshape",
        id: "start",
        preQuizIds: [preId],
      })
    );
    writeFileSync(
      join(root, "internal.ts"),
      readFileSync(join(root, "private.ts"))
    );
    rmSync(join(root, "private.ts"));
    writeFileSync(
      join(root, "caller.ts"),
      "import {secret} from './internal.ts'; export const run=()=>secret;\n"
    );

    const assess = (id: string) =>
      run(
        root,
        cli,
        "architecture",
        "exercise",
        "assess",
        JSON.stringify(
          assessmentInput(
            "reshape",
            id,
            ["caller.ts", "private.ts", "internal.ts", "public.ts"].filter(
              (file) => file !== "public.ts" || id !== "still-private"
            )
          )
        )
      );

    const bypass = assess("still-private");
    assert.equal(bypass.status, "failed");
    assert.equal(bypass.target.current, 1);
    assert.ok(
      bypass.assessment.observation.manifest.some(
        (entry: { path: string }) => entry.path === "internal.ts"
      )
    );
    writeFileSync(
      join(root, "caller.ts"),
      "import {save} from './public.ts'; export const run=()=>save();\n"
    );
    writeFileSync(
      join(root, "public.ts"),
      "import {secret} from './internal.ts'; export const save=()=>secret;\n"
    );
    const unstaged = assess("unstaged");
    assert.equal(unstaged.target.current, 0);
    assert.equal(unstaged.tracking, false);
    assert.equal(
      spawnSync(
        "git",
        [
          "add",
          "--all",
          "--",
          "caller.ts",
          "private.ts",
          "public.ts",
          "internal.ts",
        ],
        { cwd: root }
      ).status,
      0
    );
    const attempt = assess("tracked");
    assert.equal(attempt.status, "awaiting-learning");
    assert.equal(attempt.tracking, true);

    const dark = run(root, cli, "status", "--json").files.find(
      (entry: { file: string }) => entry.file === "internal.ts"
    );

    assert.equal(dark.state, "dark");
    assert.equal(dark.mind, 0);

    const postId = `${attempt.quizPrefix}actual`;
    run(
      root,
      cli,
      "log",
      JSON.stringify({
        answers: concepts.map((concept, index) => ({
          ...concept,
          answer:
            "The public entrypoint owns access to the orders implementation",
          correct: true,
          file: "internal.ts",
          question: `Different new implementation trace question ${index + 1}`,
        })),
        files: ["internal.ts"],
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
        files: ["caller.ts", "internal.ts", "public.ts"],
        id: explainId,
        text: "The moved implementation keeps its original private orders role. The caller uses the public contract and the unchanged behaviour assertion still returns seven.",
        type: "explain",
      })
    );

    const completion = {
      attemptId: "tracked",
      exerciseId: "reshape",
      explainId,
      id: "accept",
      invariantReview: [
        {
          evidence:
            "Actual learner reviewed the mapped implementation, unchanged caller test and required validation.",
          invariant: "Caller run returns 7",
          preserved: true,
        },
      ],
      postQuizIds: [postId],
    };

    const result = run(
      root,
      cli,
      "architecture",
      "exercise",
      "complete",
      JSON.stringify(completion)
    );

    assert.equal(result.state, "passed");
    assert.deepEqual(result.pass.files, [
      "caller.ts",
      "internal.ts",
      "public.ts",
    ]);
    assert.equal(Object.hasOwn(result.pass.snapshots, "private.ts"), false);
    assert.deepEqual(result.preparation, prepared);
    assert.equal(
      run(root, cli, "status", "--json").files.find(
        (entry: { file: string }) => entry.file === "internal.ts"
      ).state,
      "practised"
    );

    for (const file of ["private.ts", "untracked.ts"]) {
      if (file === "untracked.ts") {
        writeFileSync(join(root, file), "export const untouched=1;\n");
      }

      const kata = execute(
        root,
        cli,
        "log",
        JSON.stringify({
          files: [file],
          id: `ordinary-${file}`,
          module: "fixture",
          target: { file, goal: 1, metric: "complexity" },
          technique: "test existing-only boundary",
          type: "kata_start",
        })
      );

      assert.equal(kata.status, 1);
      assert.match(kata.stderr, /tracked regular files/u);
    }

    assert.equal(
      run(root, cli, "architecture", "inspect", attempt.assessment.id, "--json")
        .freshness.status,
      "current"
    );
  }
);

test(
  "a late edit to an uncredited caller during supported practice validation prevents the final event",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const originalPath = process.env.PATH;

    const realGit = spawnSync("which", ["git"], {
      encoding: "utf-8",
    }).stdout.trim();

    const bin = join(root, ".keepup/git-bin");
    mkdirSync(bin);
    const shim = join(bin, "git");
    writeFileSync(
      shim,
      `#!/bin/sh\nif [ "$1" = "merge-base" ] && [ -f '${root}/.keepup/arm-late' ]; then\n  count=0\n  if [ -f '${root}/.keepup/late-count' ]; then read count < '${root}/.keepup/late-count'; fi\n  count=$((count+1))\n  printf '%s\\n' "$count" > '${root}/.keepup/late-count'\n  if [ "$count" -eq 2 ]; then printf '// concurrent caller edit\\n' >> '${root}/public.ts'; fi\nfi\nexec '${realGit}' "$@"\n`
    );
    chmodSync(shim, 0o755);
    process.env.PATH = `${bin}:${originalPath}`;
    t.after(() => {
      process.env.PATH = originalPath;
    });
    startSubmissionFixture(root, "late-edit");
    writeFileSync(
      join(root, "caller.ts"),
      "import {save} from './public.ts'; export const run=()=>save();\n"
    );

    const attempt = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(assessmentInput("late-edit", "objective"))
    );

    assert.equal(attempt.status, "awaiting-learning");
    const complete = linkedLearning(root, "late-edit", attempt);
    writeFileSync(join(root, ".keepup/arm-late"), "armed");

    const rejected = execute(
      root,
      CLI,
      "architecture",
      "exercise",
      "complete",
      JSON.stringify(complete)
    );

    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Candidate source/u);
    assert.match(
      readFileSync(join(root, "public.ts"), "utf-8"),
      /concurrent caller edit/u
    );
    assert.equal(
      readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
        '"architecture_pass"'
      ),
      false
    );
    assert.equal(
      run(
        root,
        CLI,
        "architecture",
        "exercise",
        "inspect",
        "late-edit",
        "--json"
      ).state,
      "active"
    );
  }
);

test(
  "architecture rule targets cannot be laundered through another private endpoint, sibling consumer or reexport and selected guardrails stay independent",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    writeFileSync(join(root, "other.ts"), "export const other=()=>7;\n");
    writeFileSync(join(root, "private2.ts"), "export const secret=7;\n");
    assert.equal(
      spawnSync("git", ["add", "other.ts", "private2.ts"], { cwd: root })
        .status,
      0
    );
    assert.equal(
      spawnSync("git", ["commit", "-qm", "complete fixed module inventory"], {
        cwd: root,
      }).status,
      0
    );

    const definition = run(
      root,
      CLI,
      "architecture",
      "inspect",
      "seams",
      "--json"
    ).assessment.input;

    run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify({
        ...definition,
        id: "full",
        modules: definition.modules.map(
          (module: { id: string; members: string[] }) => ({
            ...module,
            members: [
              ...module.members,
              module.id === "caller" ? "other.ts" : "private2.ts",
            ],
          })
        ),
        rules: [
          ...definition.rules,
          {
            dependency: "all",
            from: "orders",
            id: "reverse",
            kind: "forbidden",
            to: "caller",
          },
        ],
      })
    );

    const input = {
      ...preparation("laundering"),
      assessmentId: "full",
      files: ["caller.ts", "other.ts", "public.ts"],
      guardrails: [{ kind: "forbidden-direction", ruleId: "reverse" }],
    };

    startSubmissionFixture(root, "laundering", input);

    const scenarios = [
      {
        caller:
          "import {secret} from './private2.ts'; export const run=()=>secret;\n",
        count: 1,
        files: ["caller.ts"],
        id: "endpoint",
        other: "export const other=()=>7;\n",
        public: "export const save = () => 7;\n",
      },
      {
        caller:
          "import {other} from './other.ts'; export const run=()=>other();\n",
        count: 1,
        files: ["caller.ts", "other.ts"],
        id: "sibling",
        other:
          "import {secret} from './private.ts'; export const other=()=>secret;\n",
        public: "export const save = () => 7;\n",
      },
      {
        caller:
          "import {save} from './public.ts'; export const run=()=>save;\n",
        count: 1,
        files: ["caller.ts", "public.ts"],
        id: "reexport",
        other: "export const other=()=>7;\n",
        public: "export {secret as save} from './private.ts';\n",
      },
      {
        caller:
          "import {save} from './public.ts'; export const run=()=>save();\n",
        count: 0,
        files: ["caller.ts", "public.ts"],
        id: "guardrail",
        other: "export const other=()=>7;\n",
        public:
          "import {run} from './caller.ts'; export const save=()=>7; export const extra=()=>run();\n",
      },
    ];

    for (const scenario of scenarios) {
      writeFileSync(join(root, "caller.ts"), scenario.caller);
      writeFileSync(join(root, "other.ts"), scenario.other);
      writeFileSync(join(root, "public.ts"), scenario.public);

      const attempt = run(
        root,
        CLI,
        "architecture",
        "exercise",
        "assess",
        JSON.stringify(
          assessmentInput("laundering", scenario.id, scenario.files)
        )
      );

      assert.equal(attempt.status, "failed", JSON.stringify(attempt));
      assert.equal(attempt.target.current, scenario.count);

      if (scenario.id === "guardrail") {
        assert.equal(attempt.guardrails[0].current, 1);
      }
    }
  }
);

test(
  "architecture cycle target survives SCC expansion and splitting and accepts a genuine acyclic repair",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);

    for (const [name, next] of [
      ["a", "b"],
      ["b", "c"],
      ["c", "d"],
      ["d", "a"],
    ]) {
      writeFileSync(
        join(root, `${name}.ts`),
        `import {${next}} from './${next}.ts'; export const ${name}=()=>7; export const next=()=>${next}();\n`
      );
    }

    writeFileSync(
      join(root, "cycle.test.ts"),
      "import assert from 'node:assert/strict'; import test from 'node:test'; import {a} from './a.ts'; import {b} from './b.ts'; import {c} from './c.ts'; import {d} from './d.ts'; test('cycle functions preserve results',()=>assert.equal(a()+b()+c()+d(),28));\n"
    );
    assert.equal(
      spawnSync(
        "git",
        ["add", "a.ts", "b.ts", "c.ts", "d.ts", "cycle.test.ts"],
        { cwd: root }
      ).status,
      0
    );
    assert.equal(
      spawnSync("git", ["commit", "-qm", "original four member cycle"], {
        cwd: root,
      }).status,
      0
    );
    const configPath = join(root, ".keepup/config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        ...JSON.parse(readFileSync(configPath, "utf-8")),
        testCommand:
          "node --test --test-reporter=tap behaviour.test.ts cycle.test.ts",
      })
    );

    const definition = run(
      root,
      CLI,
      "architecture",
      "inspect",
      "seams",
      "--json"
    ).assessment.input;

    run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify({
        ...definition,
        cycles: { dependency: "runtime", exceptions: [], id: "no-cycles" },
        id: "cycles",
        modules: [
          ...definition.modules,
          ...["a", "b", "c", "d"].map((name) => ({
            id: name,
            interface: [`${name}.ts`],
            members: [`${name}.ts`],
          })),
          {
            id: "tests",
            interface: ["cycle.test.ts"],
            members: ["cycle.test.ts"],
          },
        ],
      })
    );

    const concepts = preparation("unused").concepts.map((concept) => ({
      ...concept,
      file: "a.ts",
    }));

    const input = {
      ...preparation("cycle-repair"),
      assessmentId: "cycles",
      concepts,
      files: ["a.ts", "b.ts", "c.ts", "d.ts", "public.ts"],
      guardrails: [{ kind: "prohibited-cycle", ruleId: "no-cycles" }],
      target: {
        goal: 0,
        kind: "prohibited-cycle",
        modules: ["a", "b", "c", "d"],
        ruleId: "no-cycles",
      },
    };

    const prepared = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(input)
    );

    const preId = `${prepared.quizPrefix}answers`;
    run(
      root,
      CLI,
      "log",
      JSON.stringify({
        answers: concepts.map((concept, index) => ({
          ...concept,
          answer: "The logical policy covers the full cycle",
          correct: true,
          question: `Actual cycle question ${index + 1}`,
        })),
        files: ["a.ts"],
        id: preId,
        phase: "pre",
        type: "quiz",
      })
    );
    run(
      root,
      CLI,
      "architecture",
      "exercise",
      "start",
      JSON.stringify({ exerciseId: input.id, id: "start", preQuizIds: [preId] })
    );
    assert.equal(prepared.targetBaseline, 1);
    const originalA = readFileSync(join(root, "a.ts"), "utf-8");
    writeFileSync(
      join(root, "a.ts"),
      `${originalA}import {save} from './public.ts'; export const connection=()=>save();\n`
    );
    writeFileSync(
      join(root, "public.ts"),
      "import {a} from './a.ts'; export const save=()=>7; export const connection=()=>a();\n"
    );

    const expanded = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(
        assessmentInput(input.id, "expanded", ["a.ts", "public.ts"])
      )
    );

    assert.equal(expanded.status, "failed");
    assert.equal(expanded.target.current, 1);
    writeFileSync(join(root, "a.ts"), originalA);
    writeFileSync(join(root, "public.ts"), "export const save = () => 7;\n");
    writeFileSync(
      join(root, "b.ts"),
      "import {a} from './a.ts'; export const b=()=>7; export const next=()=>a();\n"
    );
    writeFileSync(
      join(root, "d.ts"),
      "import {c} from './c.ts'; export const d=()=>7; export const next=()=>c();\n"
    );

    const split = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(assessmentInput(input.id, "split", ["b.ts", "d.ts"]))
    );

    assert.equal(split.status, "failed");
    assert.equal(split.target.current, 2);
    assert.equal(split.guardrails[0].current, 2);
    writeFileSync(join(root, "b.ts"), "export const b=()=>7;\n");
    writeFileSync(join(root, "d.ts"), "export const d=()=>7;\n");

    const repaired = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(assessmentInput(input.id, "repaired", ["b.ts", "d.ts"]))
    );

    assert.equal(
      repaired.status,
      "awaiting-learning",
      JSON.stringify(repaired)
    );
    assert.equal(repaired.target.current, 0);
  }
);

test(
  "failed architecture attempts preserve baseline and reject weak tests, unresolved attribution, changed definitions and unexpected commits",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const prepared = startSubmissionFixture(root, "failures");
    const original = readFileSync(join(root, "caller.ts"), "utf-8");

    const assess = (id: string, files = ["caller.ts"]) =>
      run(
        root,
        CLI,
        "architecture",
        "exercise",
        "assess",
        JSON.stringify(assessmentInput("failures", id, files))
      );

    writeFileSync(
      join(root, "caller.ts"),
      "import { secret as renamed } from './private.ts'; export const run = () => renamed;\n"
    );
    const target = assess("target");
    assert.equal(target.status, "failed");
    assert.equal(target.target.current, 1);
    writeFileSync(
      join(root, "caller.ts"),
      "import { save } from './public.ts'; export const run = () => save()+1;\n"
    );
    assert.match(
      assess("behaviour").errors.join(" "),
      /test command did not complete/u
    );
    writeFileSync(
      join(root, "caller.ts"),
      "import { save } from './public.ts'; export const run = () => save();\n"
    );
    const unresolved = assessmentInput("failures", "agent");
    unresolved.attribution = [{ author: "agent", file: "caller.ts" }];
    assert.match(
      run(
        root,
        CLI,
        "architecture",
        "exercise",
        "assess",
        JSON.stringify(unresolved)
      ).errors.join(" "),
      /attribution/u
    );
    chmodSync(join(root, "public.ts"), 0o755);
    assert.match(assess("source-mode").errors.join(" "), /modes changed/u);
    chmodSync(join(root, "public.ts"), 0o644);
    assert.equal(
      spawnSync("git", ["update-index", "--chmod=+x", "public.ts"], {
        cwd: root,
      }).status,
      0
    );
    assert.match(assess("index-mode").errors.join(" "), /modes changed/u);
    assert.equal(
      spawnSync("git", ["update-index", "--chmod=-x", "public.ts"], {
        cwd: root,
      }).status,
      0
    );

    const testPath = join(root, "behaviour.test.ts");
    const testBytes = readFileSync(testPath);
    writeFileSync(
      testPath,
      "import test from 'node:test'; test('public caller retains save value',()=>{});\n"
    );
    assert.match(
      assess("weakened", ["caller.ts", "behaviour.test.ts"]).errors.join(" "),
      /Out-of-scope|behavioural test/u
    );
    writeFileSync(testPath, testBytes);
    const configPath = join(root, ".keepup/config.json");
    const config = readFileSync(configPath);
    writeFileSync(
      configPath,
      JSON.stringify({ ...JSON.parse(config.toString()), testCommand: "true" })
    );
    assert.match(
      assess("definitions").errors.join(" "),
      /definitions changed/u
    );
    writeFileSync(configPath, config);
    writeFileSync(join(root, "unexpected.ts"), "export const unexpected=1;\n");
    assert.match(assess("extra").errors.join(" "), /untracked/u);
    rmSync(join(root, "unexpected.ts"));
    assert.equal(
      spawnSync("git", ["add", "caller.ts"], { cwd: root }).status,
      0
    );
    assert.equal(
      spawnSync(
        "git",
        ["-c", "user.email=agent@example.com", "commit", "-qm", "foreign edit"],
        { cwd: root }
      ).status,
      0
    );
    assert.match(
      assess("foreign-commit").errors.join(" "),
      /Unexpected commit/u
    );

    const context = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "inspect",
      "failures",
      "--json"
    );

    assert.deepEqual(context.preparation, prepared);
    assert.equal(context.state, "active");
    assert.equal(context.attempts.length, 9);
    assert.equal(
      readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
        '"architecture_pass"'
      ),
      false
    );
    assert.notEqual(readFileSync(join(root, "caller.ts"), "utf-8"), original);
    run(
      root,
      CLI,
      "architecture",
      "exercise",
      "abandon",
      JSON.stringify({
        exerciseId: "failures",
        id: "abandon",
        reason: "Explicit learner stop; leave code intact",
      })
    );
    assert.equal(
      execute(
        root,
        CLI,
        "architecture",
        "exercise",
        "assess",
        JSON.stringify(assessmentInput("failures", "after-abandon"))
      ).status,
      1
    );
  }
);

test(
  "architecture completion rejects reused questions, stale answers and source edits; accepted evidence without event remains recoverable",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    startSubmissionFixture(root, "learning");

    const repair =
      "import { save } from './public.ts'; export const run = () => save();\n";

    writeFileSync(join(root, "caller.ts"), repair);
    const input = assessmentInput("learning", "objective");

    const attempt = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(input)
    );

    assert.deepEqual(
      run(
        root,
        CLI,
        "architecture",
        "exercise",
        "assess",
        JSON.stringify(input)
      ),
      attempt
    );
    const badId = `${attempt.quizPrefix}same`;
    run(
      root,
      CLI,
      "log",
      JSON.stringify({
        answers: preparation("unused").concepts.map((concept, index) => ({
          ...concept,
          answer: "Actual response",
          correct: true,
          question: `Actual fixture question ${index + 1}: which boundary owns this value?`,
        })),
        files: ["caller.ts"],
        id: badId,
        phase: "post",
        type: "quiz",
      })
    );
    const complete = linkedLearning(root, "learning", attempt);
    assert.equal(
      execute(
        root,
        CLI,
        "architecture",
        "exercise",
        "complete",
        JSON.stringify({ ...complete, postQuizIds: [badId] })
      ).status,
      1
    );
    assert.equal(
      execute(
        root,
        CLI,
        "architecture",
        "exercise",
        "complete",
        JSON.stringify({ ...complete, invariantReview: [] })
      ).status,
      1
    );
    writeFileSync(
      join(root, "caller.ts"),
      `${repair}// Concurrent edit after post answers\n`
    );
    assert.equal(
      execute(
        root,
        CLI,
        "architecture",
        "exercise",
        "complete",
        JSON.stringify(complete)
      ).status,
      1
    );
    writeFileSync(join(root, "caller.ts"), repair);
    const before = readFileSync(join(root, ".keepup/events.jsonl"));

    const passed = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "complete",
      JSON.stringify(complete)
    );

    assert.equal(passed.state, "passed");
    // Model a crash after immutable acceptance publication but before the final append.
    writeFileSync(join(root, ".keepup/events.jsonl"), before);
    assert.equal(
      run(
        root,
        CLI,
        "architecture",
        "exercise",
        "inspect",
        "learning",
        "--json"
      ).state,
      "active"
    );
    writeFileSync(
      join(root, "caller.ts"),
      `${repair}// Cannot credit changed bytes after crash\n`
    );
    assert.equal(
      execute(
        root,
        CLI,
        "architecture",
        "exercise",
        "complete",
        JSON.stringify(complete)
      ).status,
      1
    );
    assert.equal(
      readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").includes(
        '"architecture_pass"'
      ),
      false
    );

    const updated = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(assessmentInput("learning", "objective-new"))
    );

    assert.equal(updated.status, "awaiting-learning");

    const newCompletion = {
      ...linkedLearning(root, "learning", updated),
      id: "accept-new",
    };

    const recovered = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "complete",
      JSON.stringify(newCompletion)
    );

    assert.equal(recovered.state, "passed");
    assert.equal(recovered.pass.attemptId, "objective-new");
    writeFileSync(
      join(root, "caller.ts"),
      `${repair}// Later work must not replay practice\n`
    );
    assert.deepEqual(
      run(
        root,
        CLI,
        "architecture",
        "exercise",
        "complete",
        JSON.stringify(newCompletion)
      ),
      recovered
    );
    assert.equal(
      readFileSync(join(root, ".keepup/events.jsonl"), "utf-8").split(
        '"architecture_pass"'
      ).length - 1,
      1
    );
  }
);

test(
  "architecture objective assessment links actual post answers and explain before one internal practice event",
  { skip: !TOOL },
  async (t) => {
    const root = fixture(t);
    writeFileSync(
      join(root, "decoy.test.ts"),
      `${readFileSync(join(root, "decoy.test.ts"), "utf-8")}// Unrelated baseline dirt stays uncredited and unchanged\n`
    );

    const declaration = run(
      root,
      CLI,
      "architecture",
      "inspect",
      "seams",
      "--json"
    ).assessment.input;

    run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify({ ...declaration, id: "dirty-baseline" })
    );

    const installed = join(root, "installed");
    cpSync(dirname(dirname(CLI)), installed, { recursive: true });
    const cli = join(installed, "scripts/keepup.mjs");

    const reviewed = {
      dimension: "interface-leverage",
      evidence: ["caller.ts"],
      exclusions: [],
      id: "review-before",
      limitations: [],
      module: {
        id: "caller",
        interface: ["caller.ts"],
        members: ["caller.ts"],
      },
      review: {
        confidence: "medium",
        notes: "Actual synthetic caller review",
        reviewer: "Fixture learner",
        status: "reviewed",
      },
      scenarios: [
        {
          description: "Save through the caller",
          evidence: ["caller.ts"],
          id: "save",
          obligations: [
            {
              classification: "avoidable",
              description: "Caller chooses implementation",
              evidence: ["caller.ts"],
              kind: "configuration",
            },
          ],
          rating: 0.5,
          rationale: "Synthetic reviewed baseline",
        },
      ],
    };

    run(root, cli, "architecture", "record", JSON.stringify(reviewed));

    const prepared = run(
      root,
      cli,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify({
        ...preparation("finish"),
        assessmentId: "dirty-baseline",
      })
    );

    const pre = quiz(root, cli, prepared);
    run(
      root,
      cli,
      "architecture",
      "exercise",
      "start",
      JSON.stringify({ exerciseId: "finish", id: "start", preQuizIds: [pre] })
    );
    writeFileSync(
      join(root, "caller.ts"),
      "import { save } from './public.ts'; export const run = () => save();\n"
    );

    assert.equal(
      spawnSync("git", ["add", "caller.ts"], { cwd: root }).status,
      0
    );
    assert.equal(
      spawnSync("git", ["commit", "-qm", "learner repair"], { cwd: root })
        .status,
      0
    );

    run(
      root,
      cli,
      "architecture",
      "record",
      JSON.stringify({
        ...reviewed,
        id: "review-after",
        scenarios: reviewed.scenarios.map((scenario) => ({
          ...scenario,
          rating: 0,
          rationale: "Synthetic advisory regression",
        })),
      })
    );

    const input = {
      attribution: [{ author: "learner", file: "caller.ts" }],
      exerciseId: "finish",
      id: "repair",
      reason: "Learner confirmed this diff",
    };

    const attempt = run(
      root,
      cli,
      "architecture",
      "exercise",
      "assess",
      JSON.stringify(input)
    );

    assert.equal(attempt.status, "awaiting-learning");
    assert.equal(attempt.target.current, 0);
    assert.ok(
      attempt.advisory.some(
        (message: string) =>
          message.includes("interface-leverage advisory") &&
          message.includes('"value":-0.5')
      )
    );
    assert.equal(attempt.commits.length, 1);
    const postId = `${attempt.quizPrefix}answers`;
    run(
      root,
      cli,
      "log",
      JSON.stringify({
        answers: preparation("unused").concepts.map((concept, index) => ({
          ...concept,
          answer: "The public save contract preserves the returned value",
          correct: true,
          question: `Different actual impact question ${index + 1}`,
        })),
        files: ["caller.ts"],
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
        files: ["caller.ts"],
        id: explainId,
        text: "The caller uses the public save contract. Its returned value stays seven and callers retain their behaviour.",
        type: "explain",
      })
    );

    const complete = {
      attemptId: "repair",
      exerciseId: "finish",
      explainId,
      id: "accept",
      invariantReview: [
        {
          evidence:
            "Reviewed the actual caller diff and existing positive assertion; no validation was removed.",
          invariant: "Caller run returns 7",
          preserved: true,
        },
      ],
      postQuizIds: [postId],
    };

    const invoke = () => concurrentExercise(root, cli, "complete", complete);
    const [one, two] = await Promise.all([invoke(), invoke()]);
    const passed = JSON.parse(one);
    assert.deepEqual(passed, JSON.parse(two));

    assert.equal(passed.state, "passed");
    assert.deepEqual(
      run(
        root,
        cli,
        "architecture",
        "exercise",
        "complete",
        JSON.stringify(complete)
      ),
      passed
    );

    const events = readFileSync(join(root, ".keepup/events.jsonl"), "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.equal(
      events.filter((event) => event.type === "architecture_pass").length,
      1
    );
    assert.deepEqual(
      events.find((event) => event.type === "architecture_pass").files,
      ["caller.ts"]
    );

    const acceptedEvent = events.find(
      (event) => event.type === "architecture_pass"
    );

    assert.equal(
      execute(
        root,
        cli,
        "log",
        JSON.stringify({
          acceptanceId: acceptedEvent.acceptanceId,
          attemptId: acceptedEvent.attemptId,
          evidenceDigest: acceptedEvent.evidenceDigest,
          exerciseId: acceptedEvent.exerciseId,
          files: acceptedEvent.files,
          id: acceptedEvent.id,
          type: acceptedEvent.type,
        })
      ).status,
      1
    );

    const check = {
      answers: [
        {
          answer: "The public save operation owns the contract",
          concept: "public boundary",
          correct: true,
          file: "caller.ts",
          question: "A later actual boundary prediction",
        },
      ],
      files: ["caller.ts"],
      id: "delayed-real-answer",
      phase: "check",
      type: "quiz",
    };

    assert.equal(execute(root, cli, "log", JSON.stringify(check)).status, 1);

    const later = spawnSync(
      process.execPath,
      [cli, "log", JSON.stringify(check)],
      {
        cwd: root,
        encoding: "utf-8",
        env: {
          ...process.env,
          KEEPUP_ANALYSER_DIRECTORY: TOOL,
          KEEPUP_NOW: new Date(
            Date.parse(acceptedEvent.t) + 2 * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
      }
    );

    assert.equal(later.status, 0, later.stderr);
    assert.equal(JSON.parse(later.stdout).phase, "check");
    assert.equal(
      execute(
        root,
        cli,
        "log",
        JSON.stringify({
          acceptanceId: "accept",
          attemptId: "repair",
          evidenceDigest: "0".repeat(64),
          exerciseId: "finish",
          files: ["caller.ts"],
          id: "forged",
          type: "architecture_pass",
        })
      ).status,
      1
    );
    assert.equal(
      execute(
        root,
        cli,
        "architecture",
        "exercise",
        "abandon",
        JSON.stringify({ exerciseId: "finish", id: "late", reason: "Too late" })
      ).status,
      1
    );
  }
);

test(
  "copied exercise preparation and actual linked quiz start preserve baseline, ownership and pending/abandon semantics",
  { skip: !TOOL },
  async (t) => {
    const root = fixture(t);
    const installed = join(root, "installed");
    cpSync(dirname(dirname(CLI)), installed, { recursive: true });
    const cli = join(installed, "scripts/keepup.mjs");
    const input = preparation("start");

    const prepared = run(
      root,
      cli,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(input)
    );

    assert.equal(prepared.targetBaseline, 1);
    assert.equal(prepared.tests.exitCode, 0);
    assert.ok(
      prepared.inventory.manifest.some(
        (entry: { path: string }) => entry.path === "behaviour.test.ts"
      )
    );
    assert.ok(
      prepared.inventory.hostAssets.some(
        (entry: { path: string }) => entry.path === "scripts/keepup.ts"
      )
    );
    assert.deepEqual(
      run(
        root,
        cli,
        "architecture",
        "exercise",
        "prepare",
        JSON.stringify(input)
      ),
      prepared
    );
    const preId = quiz(root, cli, prepared);

    const start = {
      exerciseId: "start",
      id: "start-action",
      preQuizIds: [preId],
    };

    const invoke = () =>
      // oxlint-disable-next-line promise/avoid-new -- Concurrent public CLI calls verify shared-lock start retries.
      new Promise<string>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [cli, "architecture", "exercise", "start", JSON.stringify(start)],
          {
            cwd: root,
            env: { ...process.env, KEEPUP_ANALYSER_DIRECTORY: TOOL },
          }
        );

        let output = "";
        let errors = "";
        child.stdout.on("data", (chunk) => {
          output += chunk;
        });
        child.stderr.on("data", (chunk) => {
          errors += chunk;
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code) {
            reject(new Error(errors));
          } else {
            resolve(output);
          }
        });
      });

    const [one, two] = await Promise.all([invoke(), invoke()]);
    assert.deepEqual(JSON.parse(one), JSON.parse(two));
    const active = JSON.parse(one);

    assert.equal(active.state, "active");
    assert.equal(active.start.quizzes[0].answers.length, 3);
    assert.deepEqual(active.preparation, prepared);
    assert.deepEqual(
      run(
        root,
        cli,
        "architecture",
        "exercise",
        "start",
        JSON.stringify(start)
      ),
      active
    );

    const report = run(
      root,
      cli,
      "architecture",
      "exercise",
      "report",
      "start",
      "--no-open"
    );

    assert.match(readFileSync(report.path, "utf-8"), /Architecture exercise/u);

    const pending = run(
      root,
      cli,
      "architecture",
      "exercise",
      "submit",
      JSON.stringify({
        exerciseId: "start",
        id: "pending",
        reason: "Learner requests assessment",
      })
    );

    assert.equal(pending.state, "submission-pending");

    const abandoned = run(
      root,
      cli,
      "architecture",
      "exercise",
      "abandon",
      JSON.stringify({
        exerciseId: "start",
        id: "abandon",
        reason: "Learner explicitly stops",
      })
    );

    assert.equal(abandoned.state, "abandoned");
    assert.deepEqual(abandoned.preparation, prepared);

    const events = readFileSync(join(root, ".keepup/events.jsonl"), "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.deepEqual(
      events.map((event) => event.type),
      ["quiz"]
    );
    assert.equal(
      readFileSync(join(root, "caller.ts"), "utf-8"),
      "import { secret } from './private.ts'; export const run = () => secret;\n"
    );
  }
);

test(
  "source changes after real quiz preserve preparation and block start without reverting learner edits",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const input = preparation("collision");

    const prepared = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(input)
    );

    const preId = quiz(root, CLI, prepared);

    const changed =
      "import {save} from './public.ts'; export const run = () => save();\n";

    writeFileSync(join(root, "caller.ts"), changed);

    const rejected = execute(
      root,
      CLI,
      "architecture",
      "exercise",
      "start",
      JSON.stringify({
        exerciseId: input.id,
        id: "collision-start",
        preQuizIds: [preId],
      })
    );

    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /changed after exercise preparation/u);
    assert.equal(
      run(root, CLI, "architecture", "exercise", "inspect", input.id, "--json")
        .state,
      "prepared"
    );
    assert.deepEqual(
      run(
        root,
        CLI,
        "architecture",
        "exercise",
        "prepare",
        JSON.stringify(input)
      ),
      prepared
    );
    assert.equal(readFileSync(join(root, "caller.ts"), "utf-8"), changed);
  }
);

test(
  "start rejects old answers and changed installed host assets; another learner cannot claim or overlap the context",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const installed = mkdtempSync(join(tmpdir(), "exercise-host-install-"));
    t.after(() => rmSync(installed, { force: true, recursive: true }));
    cpSync(dirname(dirname(CLI)), installed, { recursive: true });
    const cli = join(installed, "scripts/keepup.mjs");

    const prepared = run(
      root,
      cli,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(preparation("host"))
    );

    const invalid = execute(
      root,
      cli,
      "architecture",
      "exercise",
      "start",
      JSON.stringify({
        exerciseId: "host",
        id: "bad-quiz",
        preQuizIds: ["old-unrelated-answer"],
      })
    );

    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /actual standalone answers/u);
    const preId = quiz(root, cli, prepared);
    const hostPath = join(installed, "scripts/handlers/parse-event.ts");
    writeFileSync(
      hostPath,
      `${readFileSync(hostPath, "utf-8")}\n// A changed installed parser\n`
    );

    const changed = execute(
      root,
      cli,
      "architecture",
      "exercise",
      "start",
      JSON.stringify({
        exerciseId: "host",
        id: "host-start",
        preQuizIds: [preId],
      })
    );

    assert.equal(changed.status, 1);
    assert.match(changed.stderr, /changed after exercise preparation/u);
    assert.equal(
      spawnSync("git", ["config", "user.email", "another@example.com"], {
        cwd: root,
      }).status,
      0
    );

    const foreign = execute(
      root,
      cli,
      "architecture",
      "exercise",
      "start",
      JSON.stringify({ exerciseId: "host", id: "foreign", preQuizIds: [preId] })
    );

    assert.equal(foreign.status, 1);
    assert.match(foreign.stderr, /another learner/u);

    const overlap = execute(
      root,
      cli,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(preparation("overlap"))
    );

    assert.equal(overlap.status, 1);
    assert.match(overlap.stderr, /already active/u);

    const ordinary = execute(
      root,
      cli,
      "log",
      JSON.stringify({
        files: ["caller.ts"],
        id: "ordinary",
        module: "caller",
        target: { file: "caller.ts", goal: 1, metric: "complexity" },
        technique: "Extract",
        type: "kata_start",
      })
    );

    assert.equal(ordinary.status, 1);
    assert.match(ordinary.stderr, /architecture exercise context is active/u);
  }
);

test(
  "invalid baselines and a different learner's ordinary kata prevent preparation without creating context",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const configPath = join(root, ".keepup/config.json");
    const configBytes = readFileSync(configPath);
    const config = JSON.parse(configBytes.toString("utf-8"));

    for (const command of [
      null,
      "node -e 'process.exit(7)'",
      "true",
      "node -e 'process.exit(0)'",
    ]) {
      writeFileSync(
        configPath,
        JSON.stringify({ ...config, testCommand: command })
      );

      const result = execute(
        root,
        CLI,
        "architecture",
        "exercise",
        "prepare",
        JSON.stringify(
          preparation(command === null ? "missing-tests" : "failing-tests")
        )
      );

      assert.equal(result.status, 1);
      assert.match(result.stderr, /test command|behavioural/u);
    }

    for (const example of [
      {
        command: "node --test --test-reporter=tap empty.test.ts",
        file: "empty.test.ts",
        id: "zero-cases",
        name: "missing required behaviour",
      },
      {
        command: "node --test --test-reporter=tap skip.test.ts",
        file: "skip.test.ts",
        id: "skipped-cases",
        name: "skipped behaviour",
      },
      {
        command: "node --test --test-reporter=tap empty.test.ts decoy.test.ts",
        file: "empty.test.ts",
        id: "decoy-file",
        name: "same case name",
      },
    ]) {
      writeFileSync(
        configPath,
        JSON.stringify({ ...config, testCommand: example.command })
      );

      const result = execute(
        root,
        CLI,
        "architecture",
        "exercise",
        "prepare",
        JSON.stringify({
          ...preparation(example.id),
          requiredTests: [{ file: example.file, name: example.name }],
        })
      );

      assert.equal(result.status, 1, example.id);
      assert.match(result.stderr, /required|zero|skipped/u);
    }

    writeFileSync(configPath, configBytes);
    const original = readFileSync(join(root, "caller.ts"));
    writeFileSync(
      join(root, "caller.ts"),
      `${original.toString("utf-8")}\n// Existing learner edit\n`
    );

    const dirty = execute(
      root,
      CLI,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(preparation("dirty"))
    );

    assert.equal(dirty.status, 1);
    assert.match(dirty.stderr, /current source-bound|must be clean/u);
    writeFileSync(join(root, "caller.ts"), original);

    const invalidTarget = {
      ...preparation("wrong-target"),
      target: {
        ...preparation("wrong-target").target,
        destination: "public.ts",
      },
    };

    assert.equal(
      execute(
        root,
        CLI,
        "architecture",
        "exercise",
        "prepare",
        JSON.stringify(invalidTarget)
      ).status,
      1
    );
    assert.deepEqual(run(root, CLI, "architecture", "exercise", "list"), []);
    const scorers = join(root, ".keepup/scorers");
    rmSync(scorers, { force: true, recursive: true });
    mkdirSync(scorers);
    const scorer = join(scorers, "fixed");
    writeFileSync(
      scorer,
      "#!/usr/bin/env node\nconsole.log(JSON.stringify({file:'caller.ts',metric:'fixed',value:0.2}));\n"
    );
    chmodSync(scorer, 0o755);
    run(
      root,
      CLI,
      "log",
      JSON.stringify({
        files: ["caller.ts"],
        id: "ordinary-before",
        module: "caller",
        target: { file: "caller.ts", goal: 0.8, metric: "fixed" },
        technique: "Extract",
        type: "kata_start",
      })
    );
    assert.equal(
      spawnSync("git", ["config", "user.email", "another@example.com"], {
        cwd: root,
      }).status,
      0
    );

    const blocked = execute(
      root,
      CLI,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(preparation("ordinary-conflict"))
    );

    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /already active/u);
    assert.deepEqual(run(root, CLI, "architecture", "exercise", "list"), []);
  }
);

test(
  "cycle preparation freezes the named SCC and rejects scope that can only touch an unrelated cycle",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);

    for (const [file, source] of [
      [
        "a.ts",
        "import {b} from './b.ts'; export const a=()=>7; export const other=()=>b();\n",
      ],
      ["b.ts", "import {a} from './a.ts'; export const b=()=>a();\n"],
      [
        "c.ts",
        "import {d} from './d.ts'; export const c=()=>7; export const other=()=>d();\n",
      ],
      ["d.ts", "import {c} from './c.ts'; export const d=()=>c();\n"],
      [
        "cycle.test.ts",
        "import assert from 'node:assert/strict'; import test from 'node:test'; import {a} from './a.ts'; import {b} from './b.ts'; import {c} from './c.ts'; import {d} from './d.ts'; test('cycle functions preserve their results',()=>assert.equal(a()+b()+c()+d(),28));\n",
      ],
    ]) {
      writeFileSync(join(root, file ?? ""), source ?? "");
    }

    assert.equal(
      spawnSync(
        "git",
        ["add", "a.ts", "b.ts", "c.ts", "d.ts", "cycle.test.ts"],
        { cwd: root }
      ).status,
      0
    );
    assert.equal(
      spawnSync("git", ["commit", "-qm", "cycle fixtures"], { cwd: root })
        .status,
      0
    );
    const configPath = join(root, ".keepup/config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        ...JSON.parse(readFileSync(configPath, "utf-8")),
        testCommand:
          "node --test --test-reporter=tap behaviour.test.ts cycle.test.ts",
      })
    );

    const original = run(
      root,
      CLI,
      "architecture",
      "inspect",
      "seams",
      "--json"
    ).assessment.input;

    run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify({
        ...original,
        cycles: { dependency: "runtime", exceptions: [], id: "no-cycles" },
        id: "cycles",
        modules: [
          ...original.modules,
          ...["a", "b", "c", "d"].map((name) => ({
            id: name,
            interface: [`${name}.ts`],
            members: name === "b" ? ["b.ts", "cycle.test.ts"] : [`${name}.ts`],
          })),
        ],
      })
    );

    const input = {
      ...preparation("cycle-start"),
      assessmentId: "cycles",
      callers: ["cycle.test.ts"],
      concepts: preparation("concepts").concepts.map((concept) => ({
        ...concept,
        file: "a.ts",
      })),
      files: ["a.ts", "b.ts"],
      guardrails: [{ kind: "prohibited-cycle", ruleId: "no-cycles" }],
      invariants: ["All cycle functions retain result seven"],
      requiredTests: [
        {
          file: "cycle.test.ts",
          name: "cycle functions preserve their results",
        },
      ],
      target: {
        goal: 0,
        kind: "prohibited-cycle",
        modules: ["a", "b"],
        ruleId: "no-cycles",
      },
    };

    const wrong = execute(
      root,
      CLI,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify({
        ...input,
        concepts: input.concepts.map((concept) => ({
          ...concept,
          file: "c.ts",
        })),
        files: ["c.ts", "d.ts"],
        id: "wrong-cycle-scope",
      })
    );

    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /reported cycle/u);

    const prepared = run(
      root,
      CLI,
      "architecture",
      "exercise",
      "prepare",
      JSON.stringify(input)
    );

    assert.equal(prepared.targetBaseline, 1);
    assert.equal(prepared.guardrails[0].baseline, 2);
    assert.equal(prepared.tests.tests, 2);
  }
);
