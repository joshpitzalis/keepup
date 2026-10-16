import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
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

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "architecture-seams-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "other.ts"), "export const healthy = 1;\n");
  writeFileSync(join(root, "public.ts"), "export const save = () => 1;\n");
  writeFileSync(join(root, "private.ts"), "export const secret = 1;\n");
  writeFileSync(
    join(root, "caller.ts"),
    "import { save } from './public';\nimport { secret } from './private';\nexport const value = [save, secret];\n"
  );
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  run(root, CLI, "init");

  return root;
}

function input(id: string) {
  return {
    dimension: "seam-integrity",
    evidence: [],
    exclusions: [],
    id,
    limitations: [],
    modules: [
      {
        id: "orders",
        interface: ["public.ts", "other.ts"],
        members: ["public.ts", "private.ts", "other.ts"],
      },
      { id: "caller", interface: ["caller.ts"], members: ["caller.ts"] },
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
  };
}

test(
  "real copied analyser reports private dependency and preserves fixed raw target despite allowed edges",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    writeFileSync(
      join(root, "javascript-caller.js"),
      "import { save } from './public.ts'; export const saved = save;\n"
    );
    assert.equal(
      spawnSync("git", ["add", "javascript-caller.js"], { cwd: root }).status,
      0
    );

    const definition = (id: string) => {
      const value = input(id);

      return {
        ...value,
        modules: value.modules.map((module) =>
          module.id === "caller"
            ? {
                ...module,
                members: [...module.members, "javascript-caller.js"],
              }
            : module
        ),
      };
    };

    const installed = join(root, "installed");
    cpSync(dirname(dirname(CLI)), installed, { recursive: true });
    const cli = join(installed, "scripts/keepup.mjs");

    const before = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(definition("before"))
    );

    assert.equal(before.method, "automated");
    assert.equal(before.measurements.violations, 1);
    assert.equal(before.measurements.eligibleEdges, 3);
    assert.equal(before.measurements.status, "measured");
    assert.deepEqual(
      before.analysis.findings.map(
        (finding: {
          ruleId: string;
          source: string;
          destination: string;
          line: number;
        }) => [
          finding.ruleId,
          finding.source,
          finding.destination,
          finding.line,
        ]
      ),
      [["caller-orders", "caller.ts", "private.ts", 2]]
    );

    const inspection = run(
      root,
      cli,
      "architecture",
      "inspect",
      "before",
      "--json"
    );

    assert.equal(inspection.freshness.status, "current");

    const report = run(
      root,
      cli,
      "architecture",
      "report",
      "before",
      "--no-open"
    );

    assert.match(
      readFileSync(report.path, "utf-8"),
      /Violations: 1; eligible edges: 3/u
    );
    assert.equal(readFileSync(join(root, ".keepup/events.jsonl"), "utf-8"), "");
    assert.deepEqual(
      run(
        root,
        cli,
        "architecture",
        "analyse",
        JSON.stringify(definition("before"))
      ),
      before
    );
    writeFileSync(
      join(root, "caller.ts"),
      "import { save } from './public';\nimport { secret } from './private';\nimport { healthy } from './other';\nexport const value = [save, secret, healthy];\n"
    );

    const padded = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(definition("padded"))
    );

    assert.equal(padded.measurements.violations, 1);
    assert.equal(padded.measurements.eligibleEdges, 4);
    writeFileSync(
      join(root, "caller.ts"),
      "import { save } from './public';\nexport const value = save;\n"
    );

    const after = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(definition("after"))
    );

    assert.equal(after.measurements.violations, 0);

    const comparison = run(
      root,
      cli,
      "architecture",
      "compare",
      "before",
      "after",
      "--json"
    );

    assert.equal(comparison.comparable, true);
    assert.equal(comparison.changes.violations, -1);
    assert.equal(comparison.changes.eligibleEdges, -1);
    assert.equal(comparison.changes.value, null);
    assert.equal(
      run(root, cli, "architecture", "inspect", "before", "--json").freshness
        .status,
      "stale"
    );
    assert.equal(
      execute(
        root,
        cli,
        "architecture",
        "record",
        JSON.stringify(definition("forged"))
      ).status,
      1
    );
  }
);

test("unavailable analyser is recorded honestly and cannot overwrite existing observation", (t) => {
  const root = fixture(t);

  const execution = spawnSync(
    process.execPath,
    [CLI, "architecture", "analyse", JSON.stringify(input("missing-tool"))],
    {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, KEEPUP_ANALYSER_DIRECTORY: undefined },
    }
  );

  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(execution.stdout);
  assert.equal(result.analysis.status, "unavailable");
  assert.equal(result.measurements.status, "unavailable");
  assert.equal(result.measurements.value, null);
  assert.match(result.limitations.join(" "), /KEEPUP_ANALYSER_DIRECTORY/u);
  assert.equal(
    run(root, CLI, "architecture", "inspect", "missing-tool", "--json")
      .assessment.analysis.status,
    "unavailable"
  );
  assert.equal(
    execute(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify({ ...input("missing-tool"), limitations: ["changed"] })
    ).status,
    1
  );
});

test(
  "real graph retains type, external, unresolved and dynamic limitations and rejects barrel laundering",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    writeFileSync(
      join(root, "other.ts"),
      "import type { Stats } from 'node:fs'; export const healthy = 1;\n"
    );
    writeFileSync(
      join(root, "private.ts"),
      "export interface Secret { x: number }; export const secret = 1;\n"
    );
    writeFileSync(join(root, "public.ts"), "export * from './private';\n");
    writeFileSync(
      join(root, "caller.ts"),
      "import type { Secret } from './private';\nimport { secret } from './public';\nimport fs from 'node:fs';\nimport absent from './absent';\nconst dynamic = import('./private');\nconst opaque = import(process.env.TARGET!);\nexport const value = [fs, absent, secret];\n"
    );

    const result = run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify(input("coverage"))
    );

    assert.equal(result.analysis.status, "partial");
    assert.equal(result.measurements.status, "unavailable");
    assert.ok(
      result.analysis.edges.some(
        (edge: { kind: string }) => edge.kind === "type-only"
      )
    );
    assert.ok(
      result.analysis.edges.some(
        (edge: { kind: string }) => edge.kind === "external"
      )
    );
    assert.ok(
      result.analysis.edges.some(
        (edge: { kind: string }) => edge.kind === "unresolved"
      )
    );
    assert.ok(
      result.analysis.edges.some(
        (edge: { kind: string; typeOnly: boolean }) =>
          edge.kind === "external" && edge.typeOnly
      )
    );
    assert.match(
      result.limitations.join(" "),
      /Opaque dynamic dependency at caller.ts:6/u
    );
    assert.match(result.limitations.join(" "), /Unresolved dependency/u);
    assert.ok(
      result.analysis.findings.some(
        (finding: { kind: string }) => finding.kind === "interface-reexport"
      )
    );

    const runtimeOnly = {
      ...input("runtime"),
      rules: [
        {
          dependency: "runtime",
          from: "caller",
          id: "no-runtime",
          kind: "forbidden",
          to: "orders",
        },
      ],
    };

    const runtime = run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify(runtimeOnly)
    );

    assert.ok(
      runtime.analysis.findings.every(
        (finding: { dependency: string }) => finding.dependency === "runtime"
      )
    );
  }
);

test(
  "controlled analyser failures preserve old bytes, tool changes stale, source races reject mixed observations",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const tool = join(root, "tool");
    mkdirSync(join(tool, "node_modules/dependency-cruiser/bin"), {
      recursive: true,
    });
    cpSync(
      join(TOOL ?? "", "node_modules/typescript"),
      join(tool, "node_modules/typescript"),
      { recursive: true }
    );
    writeFileSync(join(tool, "package.json"), "{}");
    writeFileSync(
      join(tool, "node_modules/dependency-cruiser/package.json"),
      JSON.stringify({ version: "18.6.0" })
    );

    const executable = join(
      tool,
      "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs"
    );

    writeFileSync(join(root, "caller.ts"), "export const value = 1;\n");

    const graph = {
      modules: ["caller.ts", "private.ts", "public.ts", "other.ts"].map(
        (source) => ({
          dependencies: [],
          source,
        })
      ),
      summary: {
        environment: {
          transpilersFound: [
            {
              available: true,
              currentVersion: "typescript@5.9.3",
              name: "typescript",
            },
          ],
          version: "18.6.0",
        },
      },
    };

    writeFileSync(
      executable,
      `console.log(${JSON.stringify(JSON.stringify(graph))});\n`
    );

    const invoke = (id: string, timeout = "30000") =>
      spawnSync(
        process.execPath,
        [CLI, "architecture", "analyse", JSON.stringify(input(id))],
        {
          cwd: root,
          encoding: "utf-8",
          env: {
            ...process.env,
            KEEPUP_ANALYSER_DIRECTORY: tool,
            KEEPUP_ANALYSER_TIMEOUT_MS: timeout,
          },
        }
      );

    const initial = invoke("initial");
    assert.equal(initial.status, 0, initial.stderr);

    const original = readFileSync(
      join(root, ".keepup/architecture/observations/initial.json")
    );

    for (const [id, source, timeout, pattern] of [
      [
        "malformed",
        "console.log('{broken');",
        "30000",
        /JSON|property|Expected/u,
      ],
      ["failed", "process.exit(7);", "30000", /unavailable/u],
      ["timeout", "setTimeout(() => {}, 10000);", "50", /ETIMEDOUT/u],
      [
        "omitted",
        `console.log(${JSON.stringify(JSON.stringify({ ...graph, modules: [] }))});`,
        "30000",
        /omitted/u,
      ],
    ] as const) {
      writeFileSync(executable, source);
      const result = invoke(id, timeout);
      assert.equal(result.status, 0, result.stderr);
      const assessment = JSON.parse(result.stdout);
      assert.equal(assessment.analysis.status, "unavailable");
      assert.match(assessment.limitations.join(" "), pattern);
      assert.deepEqual(
        readFileSync(
          join(root, ".keepup/architecture/observations/initial.json")
        ),
        original
      );
    }

    const inspected = run(
      root,
      CLI,
      "architecture",
      "inspect",
      "initial",
      "--json"
    );

    assert.equal(inspected.freshness.status, "stale");
    assert.ok(
      inspected.freshness.changed.includes("analyser assets or version")
    );
    writeFileSync(
      executable,
      "import { writeFileSync } from 'node:fs'; writeFileSync('caller.ts', '// source changed'); process.exit(1);"
    );
    const race = invoke("race");
    assert.equal(race.status, 1);
    assert.match(race.stderr, /Source changed during architecture capture/u);
    assert.deepEqual(run(root, CLI, "architecture", "list"), [
      "failed",
      "initial",
      "malformed",
      "omitted",
      "timeout",
    ]);
  }
);

test(
  "tracked consumers outside declared modules cannot disappear from seam coverage",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    writeFileSync(
      join(root, "unknown-caller.ts"),
      "import { secret } from './private'; export const leak = secret;\n"
    );
    assert.equal(
      spawnSync("git", ["add", "unknown-caller.ts"], { cwd: root }).status,
      0
    );

    const result = run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify(input("unknown-caller"))
    );

    assert.equal(result.analysis.status, "partial");
    assert.equal(result.measurements.status, "unavailable");
    assert.equal(result.measurements.violations, 1);
    assert.ok(
      result.analysis.edges.some(
        (edge: { source: string; destination: string }) =>
          edge.source === "unknown-caller.ts" &&
          edge.destination === "private.ts"
      )
    );
    assert.match(
      result.limitations.join(" "),
      /Unowned consumer unknown-caller.ts -> private.ts/u
    );
  }
);
