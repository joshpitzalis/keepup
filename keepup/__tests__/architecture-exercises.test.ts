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
    assert.match(dirty.stderr, /current complete|must be clean/u);
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
