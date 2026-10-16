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

const CLI = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));
const TOOL = process.env.KEEPUP_TEST_ANALYSER_DIRECTORY;

function run(root: string, cli: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, KEEPUP_ANALYSER_DIRECTORY: TOOL },
  });

  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "architecture-cycles-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(
    join(root, "a.ts"),
    "import { b } from './b'; export const a = () => b;\n"
  );
  writeFileSync(
    join(root, "b.ts"),
    "import { a } from './a'; import { c } from './c'; export const b = () => [a, c];\n"
  );
  writeFileSync(
    join(root, "c.ts"),
    "import { b } from './b'; export const c = () => b;\n"
  );
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  run(root, CLI, "init");

  return root;
}

function input(id: string) {
  return {
    cycles: { dependency: "runtime", exceptions: [], id: "no-runtime-cycles" },
    dimension: "seam-integrity",
    evidence: [],
    exclusions: [],
    id,
    limitations: [],
    modules: ["a", "b", "c"].map((moduleId) => ({
      id: moduleId,
      interface: [`${moduleId}.ts`],
      members: [`${moduleId}.ts`],
    })),
    rules: [],
  };
}

test(
  "copied real analyser counts overlapping module cycles once with complete deterministic evidence and repair",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const installed = join(root, "installed");
    cpSync(dirname(dirname(CLI)), installed, { recursive: true });
    const cli = join(installed, "scripts/keepup.mjs");

    const before = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(input("before"))
    );

    assert.equal(before.analysis.status, "complete");
    assert.equal(before.measurements.cyclicGroups, 1);
    assert.equal(before.measurements.violations, 1);
    assert.deepEqual(before.analysis.cycles[0].modules, ["a", "b", "c"]);
    assert.deepEqual(
      before.analysis.cycles[0].path.map(
        (step: { from: string; to: string }) => [step.from, step.to]
      ),
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "b"],
        ["b", "a"],
      ]
    );
    assert.equal(before.analysis.findings[0].kind, "prohibited-cycle");
    assert.equal(before.analysis.findings[0].ruleId, "no-runtime-cycles");
    assert.equal(before.analysis.cycles[0].path[0].edge.source, "a.ts");

    const reordered = {
      ...input("reordered"),
      modules: input("reordered").modules.toReversed(),
    };

    const reorderedResult = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(reordered)
    );

    assert.deepEqual(reorderedResult.analysis.cycles, before.analysis.cycles);
    writeFileSync(
      join(root, "a.ts"),
      "import { b } from './b'; import { c } from './c'; export const a = () => [b, c];\n"
    );

    const padded = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(input("padded"))
    );

    assert.equal(padded.measurements.cyclicGroups, 1);
    assert.equal(padded.measurements.eligibleEdges, 5);
    writeFileSync(join(root, "c.ts"), "export const c = () => 1;\n");

    const incompleteRepair = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(input("partial-repair"))
    );

    assert.equal(incompleteRepair.measurements.cyclicGroups, 1);
    assert.deepEqual(incompleteRepair.analysis.cycles[0].modules, ["a", "b"]);
    writeFileSync(
      join(root, "b.ts"),
      "import { c } from './c'; export const b = () => c;\n"
    );

    const repaired = run(
      root,
      cli,
      "architecture",
      "analyse",
      JSON.stringify(input("repaired"))
    );

    assert.equal(repaired.measurements.cyclicGroups, 0);
    assert.equal(repaired.measurements.violations, 0);

    const comparison = run(
      root,
      cli,
      "architecture",
      "compare",
      "before",
      "repaired",
      "--json"
    );

    assert.equal(comparison.comparable, true);
    assert.equal(comparison.changes.cyclicGroups, -1);

    const report = run(
      root,
      cli,
      "architecture",
      "report",
      "before",
      "--no-open"
    );

    assert.match(readFileSync(report.path, "utf-8"), /Cyclic groups: 1/u);
  }
);

test(
  "cycle policy separates runtime and type-only dependencies; exact exceptions remain visible and incomparable",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    writeFileSync(
      join(root, "a.ts"),
      "import type { B } from './b'; export interface A { b: B };\n"
    );
    writeFileSync(
      join(root, "b.ts"),
      "import type { C } from './c'; export interface B { c: C };\n"
    );
    writeFileSync(
      join(root, "c.ts"),
      "import type { A } from './a'; export interface C { a: A };\n"
    );

    const runtime = run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify(input("runtime"))
    );

    assert.equal(runtime.measurements.cyclicGroups, 0);

    const types = {
      ...input("types"),
      cycles: { ...input("types").cycles, dependency: "type-only" },
    };

    const typed = run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify(types)
    );

    assert.equal(typed.measurements.cyclicGroups, 1);
    assert.ok(
      typed.analysis.cycles[0].path.every(
        (step: { edge: { kind: string } }) => step.edge.kind === "type-only"
      )
    );

    const permitted = {
      ...types,
      cycles: {
        ...types.cycles,
        exceptions: [
          {
            id: "recursive-types",
            modules: ["a", "b", "c"],
            reason: "Reviewed mutually recursive public types",
          },
        ],
      },
      id: "permitted",
    };

    const allowed = run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify(permitted)
    );

    assert.equal(allowed.measurements.cyclicGroups, 0);
    assert.equal(allowed.analysis.cycles.length, 1);
    assert.equal(allowed.analysis.cycles[0].permittedBy, "recursive-types");
    assert.equal(
      allowed.input.cycles.exceptions[0].reason,
      "Reviewed mutually recursive public types"
    );

    const comparison = run(
      root,
      CLI,
      "architecture",
      "compare",
      "types",
      "permitted",
      "--json"
    );

    assert.equal(comparison.comparable, false);
    assert.equal(comparison.changes.cyclicGroups, null);

    const subgroup = {
      ...permitted,
      cycles: {
        ...permitted.cycles,
        exceptions: [
          { ...permitted.cycles.exceptions[0], modules: ["a", "b"] },
        ],
      },
      id: "not-entire-group",
    };

    const notExempt = run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify(subgroup)
    );

    assert.equal(notExempt.measurements.cyclicGroups, 1);
  }
);

test(
  "internal file cycles are excluded while incomplete graphs cannot claim cross-module cycle freedom",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);

    const internal = {
      ...input("internal"),
      modules: [
        { id: "one", interface: ["a.ts"], members: ["a.ts", "b.ts", "c.ts"] },
      ],
    };

    const sameModule = run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify(internal)
    );

    assert.equal(sameModule.measurements.cyclicGroups, 0);
    assert.equal(sameModule.measurements.eligibleEdges, 0);
    assert.equal(sameModule.measurements.status, "not-applicable");
    writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "b.ts"), "export const b = 1;\n");
    writeFileSync(
      join(root, "c.ts"),
      "export const c = import(process.env.MODULE!);\n"
    );

    const partial = run(
      root,
      CLI,
      "architecture",
      "analyse",
      JSON.stringify(input("partial"))
    );

    assert.equal(partial.measurements.cyclicGroups, 0);
    assert.equal(partial.analysis.status, "partial");
    assert.equal(partial.measurements.status, "unavailable");
    assert.match(partial.limitations.join(" "), /Opaque dynamic dependency/u);

    const report = run(
      root,
      CLI,
      "architecture",
      "report",
      "partial",
      "--no-open"
    );

    assert.match(readFileSync(report.path, "utf-8"), /coverage: partial/u);

    const compared = run(
      root,
      CLI,
      "architecture",
      "compare",
      "partial",
      "partial",
      "--json"
    );

    assert.equal(compared.comparable, false);
    assert.equal(compared.changes.cyclicGroups, null);
  }
);

test("pre-cycle seam canonical input remains readable and invalid cycle definitions preserve stored evidence", (t) => {
  const root = fixture(t);

  const legacy = {
    dimension: "seam-integrity",
    evidence: [],
    exclusions: [],
    id: "legacy",
    limitations: [],
    modules: ["a", "b", "c"].map((moduleId) => ({
      id: moduleId,
      interface: [`${moduleId}.ts`],
      members: [`${moduleId}.ts`],
    })),
    rules: [],
  };

  const execution = spawnSync(
    process.execPath,
    [CLI, "architecture", "analyse", JSON.stringify(legacy)],
    {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, KEEPUP_ANALYSER_DIRECTORY: undefined },
    }
  );

  assert.equal(execution.status, 0, execution.stderr);
  const record = JSON.parse(execution.stdout);
  assert.equal(
    record.inputDigest,
    "e05d4c8d119e736dd04d21fed5d006240422c1f59490b739cf027467e116484a"
  );
  assert.equal("cycles" in record.input, false);
  assert.equal("cycles" in record.analysis, false);
  assert.equal("cyclicGroups" in record.measurements, false);
  assert.deepEqual(
    run(root, CLI, "architecture", "inspect", "legacy", "--json").assessment,
    record
  );

  const before = readFileSync(
    join(root, ".keepup/architecture/observations/legacy.json")
  );

  for (const cycles of [
    true,
    {
      dependency: "runtime",
      exceptions: [
        { id: "unknown", modules: ["a", "unknown"], reason: "unknown module" },
      ],
      id: "bad",
    },
    {
      dependency: "runtime",
      exceptions: [
        { id: "one", modules: ["a", "b"], reason: "one" },
        { id: "two", modules: ["b", "a"], reason: "same group" },
      ],
      id: "bad",
    },
    { dependency: "invalid", exceptions: [], id: "bad" },
  ]) {
    const invalid = spawnSync(
      process.execPath,
      [
        CLI,
        "architecture",
        "analyse",
        JSON.stringify({ ...legacy, cycles, id: "invalid" }),
      ],
      { cwd: root, encoding: "utf-8" }
    );

    assert.equal(invalid.status, 1);
  }

  assert.deepEqual(
    readFileSync(join(root, ".keepup/architecture/observations/legacy.json")),
    before
  );
});
