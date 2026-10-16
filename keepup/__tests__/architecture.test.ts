import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import type {
  ArchitectureAssessment,
  ArchitectureInspection,
  InterfaceAssessmentInput,
} from "../scripts/architecture/domain.ts";

const CLI = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));

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

function fixture(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "architecture-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "module.ts"), "export const save = () => 1;\n");
  writeFileSync(join(root, "caller.ts"), "save();\n");
  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);
  assert.equal(
    spawnSync("git", ["commit", "-qm", "fixture"], { cwd: root }).status,
    0
  );
  run(root, CLI, "init");

  return root;
}

function input(id: string): InterfaceAssessmentInput {
  return {
    dimension: "interface-leverage",
    evidence: [],
    exclusions: [],
    id,
    limitations: [],
    module: { id: "orders", interface: ["module.ts"], members: ["module.ts"] },
    review: {
      confidence: "medium",
      notes: "Reviewed representative caller",
      reviewer: "Learner",
      status: "reviewed",
    },
    scenarios: [
      {
        description: "Save <script>alert('unsafe')</script> order",
        evidence: ["caller.ts"],
        id: "save",
        obligations: [
          {
            classification: "avoidable",
            description: "Configure retry",
            evidence: ["caller.ts"],
            kind: "configuration",
          },
        ],
        rating: 0.5,
        rationale: "Caller owns retry setup",
      },
    ],
  };
}

function record(
  root: string,
  value: InterfaceAssessmentInput,
  cli = CLI
): ArchitectureAssessment {
  return run(root, cli, "architecture", "record", JSON.stringify(value));
}

function inspect(root: string, id: string, cli = CLI): ArchitectureInspection {
  return run(root, cli, "architecture", "inspect", id, "--json");
}

test("reviewed facts, provenance, report and supporting-source freshness agree without learning events", (t) => {
  const root = fixture(t);
  const state = join(root, ".keepup");
  const events = readFileSync(join(state, "events.jsonl"));
  const history = readFileSync(join(state, "history.jsonl"));
  const assessment = record(root, input("before"));
  assert.ok("avoidableObligations" in assessment.measurements);
  assert.equal(assessment.measurements.value, 0.5);
  assert.equal(assessment.measurements.avoidableObligations, 1);
  assert.equal(assessment.measurements.denominator, 1);
  assert.equal(assessment.observation.observer, "learner@example.com");
  assert.match(assessment.observation.revision ?? "", /^[a-f0-9]{40}$/u);
  assert.equal(inspect(root, "before").freshness.status, "current");
  assert.deepEqual(inspect(root, "before").assessment, assessment);

  const report = run(
    root,
    CLI,
    "architecture",
    "report",
    "before",
    "--no-open"
  );

  const html = readFileSync(report.path, "utf-8");
  assert.match(html, /Value: 0.5; assessed 1\/1/u);
  assert.match(html, /avoidable 1/u);
  assert.match(html, /&lt;script&gt;/u);
  assert.doesNotMatch(html, /<script/iu);
  assert.match(
    html,
    /<details><summary>Inspect captured evidence and provenance/u
  );
  writeFileSync(join(root, "caller.ts"), "save({ retry: true });\n");
  const stale = inspect(root, "before");
  assert.equal(stale.freshness.status, "stale");
  assert.deepEqual(stale.freshness.changed, ["caller.ts"]);
  assert.deepEqual(stale.assessment, assessment);

  const snapshot = assessment.observation.manifest.find(
    (entry) => entry.path === "caller.ts"
  )?.hash;

  assert.ok(snapshot);
  assert.equal(
    readFileSync(join(state, "architecture", "snapshots", snapshot), "utf-8"),
    "save();\n"
  );
  assert.deepEqual(readFileSync(join(state, "events.jsonl")), events);
  assert.deepEqual(readFileSync(join(state, "history.jsonl")), history);
});

test("missing scenarios or evidence stays unavailable and provisional findings stay labelled", (t) => {
  const root = fixture(t);
  const empty = record(root, { ...input("empty"), scenarios: [] });
  assert.equal(empty.measurements.status, "unavailable");
  assert.equal(empty.measurements.value, null);
  assert.equal(empty.measurements.denominator, 0);
  assert.match(empty.limitations.join(" "), /zero denominator/u);
  const source = input("missing");

  const missing = record(root, {
    ...source,
    review: { ...source.review, status: "provisional" },
    scenarios: source.scenarios.map((scenario) => ({
      ...scenario,
      evidence: [],
    })),
  });

  assert.equal(missing.measurements.value, null);
  assert.equal(missing.measurements.assessed, 0);
  assert.equal(missing.input.review.status, "provisional");
  assert.match(
    missing.limitations.join(" "),
    /missing rating or concrete evidence/u
  );
  assert.match(
    run(root, CLI, "architecture", "report", "missing", "--no-open").path,
    /missing.html$/u
  );
});

test("invalid, conflicting and interrupted writes preserve immutable records and retries", async (t) => {
  const root = fixture(t);
  const payload = JSON.stringify(input("same"));

  const concurrent = () =>
    // oxlint-disable-next-line promise/avoid-new -- Child-process completion is a callback API.
    new Promise<string>((resolve, reject) => {
      const process = spawn(
        globalThis.process.execPath,
        [CLI, "architecture", "record", payload],
        { cwd: root }
      );

      let stdout = "";
      let stderr = "";
      process.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      process.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      process.on("error", reject);
      process.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr));
        }
      });
    });

  const [one, two] = await Promise.all([concurrent(), concurrent()]);
  assert.deepEqual(JSON.parse(one), JSON.parse(two));

  const stored = readFileSync(
    join(root, ".keepup/architecture/observations/same.json")
  );

  writeFileSync(
    join(root, ".keepup/architecture/observations/same.json.interrupted.tmp"),
    "{partial"
  );
  assert.deepEqual(record(root, input("same")), JSON.parse(one));
  assert.deepEqual(run(root, CLI, "architecture", "list"), ["same"]);

  for (const value of [
    { ...input("same"), limitations: ["conflict"] },
    { ...input("bad"), observation: { id: "forged" } },
    {
      ...input("bad"),
      scenarios: [{ ...input("bad").scenarios[0], rating: 2 }],
    },
    { ...input("bad"), evidence: ["../escape"] },
  ]) {
    assert.equal(
      execute(root, CLI, "architecture", "record", JSON.stringify(value))
        .status,
      1
    );
  }

  assert.equal(
    execute(root, CLI, "architecture", "inspect", "../../escape").status,
    1
  );
  assert.deepEqual(
    readFileSync(join(root, ".keepup/architecture/observations/same.json")),
    stored
  );
  assert.deepEqual(
    readdirSync(join(root, ".keepup/architecture/observations")).filter(
      (name) => name.endsWith(".json")
    ),
    ["same.json"]
  );
});

test("copied installation captures rubric freshness, legacy state, and failed browser opening", (t) => {
  const root = fixture(t);
  const installed = join(root, "installed-skill");
  cpSync(dirname(dirname(CLI)), installed, { recursive: true });
  const cli = join(installed, "scripts/keepup.mjs");
  renameSync(join(root, ".keepup"), join(root, ".cogdebt"));
  const original = record(root, input("copied"), cli);
  assert.equal(inspect(root, "copied", cli).freshness.status, "current");
  writeFileSync(
    join(installed, "scripts/architecture/interface-leverage-rubric.md"),
    "changed rubric\n"
  );
  assert.equal(inspect(root, "copied", cli).freshness.status, "stale");
  assert.deepEqual(record(root, input("copied"), cli), original);
  record(root, input("copied-after"), cli);

  const comparison = run(
    root,
    cli,
    "architecture",
    "compare",
    "copied",
    "copied-after",
    "--json"
  );

  assert.equal(comparison.comparable, false);
  assert.match(comparison.reasons.join(" "), /evaluator/u);

  const comparedReport = run(
    root,
    cli,
    "architecture",
    "compare-report",
    "copied",
    "copied-after",
    "--no-open"
  );

  assert.match(comparedReport.path, /\.cogdebt\/architecture\/reports\//u);
  assert.match(readFileSync(comparedReport.path, "utf-8"), /Comparable: no/u);
  const bin = join(root, "bin");
  mkdirSync(bin);

  for (const name of ["open", "xdg-open"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 1\n");
    chmodSync(join(bin, name), 0o755);
  }

  const report = spawnSync(
    process.execPath,
    [cli, "architecture", "report", "copied"],
    {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    }
  );

  assert.equal(report.status, 0, report.stderr);
  const output = JSON.parse(report.stdout);
  assert.equal(output.opened, false);
  assert.match(output.warnings.join(" "), /automatic opening failed/u);
  assert.match(output.path, /\.cogdebt/u);
  assert.equal(readFileSync(join(root, ".cogdebt/events.jsonl"), "utf-8"), "");
});

test("calibration rewards reviewed obligation removal, ignores padding and rejects catch-all depth by inspection", (t) => {
  const root = fixture(t);
  const before = record(root, input("before"));
  const repair = input("repair");

  const improved = record(root, {
    ...repair,
    scenarios: repair.scenarios.map((scenario) => ({
      ...scenario,
      obligations: [],
      rating: 1,
      rationale: "Caller expresses save intent; module handles retry policy",
    })),
  });

  assert.ok("avoidableObligations" in before.measurements);
  assert.ok("avoidableObligations" in improved.measurements);
  assert.equal(before.measurements.avoidableObligations, 1);
  assert.equal(improved.measurements.avoidableObligations, 0);
  assert.equal(improved.measurements.value, 1);
  writeFileSync(
    join(root, "module.ts"),
    `${"// padding\n".repeat(200)}export const save = () => 1;\n`
  );
  assert.equal(
    record(root, input("padded")).measurements.value,
    before.measurements.value
  );
  const catchAll = input("catch-all");

  const opaque = record(root, {
    ...catchAll,
    scenarios: catchAll.scenarios.map((scenario) => ({
      ...scenario,
      rating: 0,
      rationale:
        "One execute(any) operation still requires caller workflow and internal policy",
    })),
  });

  assert.ok("avoidableObligations" in opaque.measurements);
  assert.equal(opaque.measurements.value, 0);
  assert.equal(opaque.measurements.avoidableObligations, 1);
});

test("captured leverage observations compare across source revisions without reanalysis or learning credit", (t) => {
  const root = fixture(t);
  const state = join(root, ".keepup");
  const events = readFileSync(join(state, "events.jsonl"));
  const before = input("comparison-before");
  record(root, before);
  writeFileSync(join(root, "caller.ts"), "save({ intent: 'order' });\n");
  assert.equal(
    spawnSync("git", ["commit", "-am", "repair", "-q"], { cwd: root }).status,
    0
  );
  record(root, {
    ...before,
    id: "comparison-after",
    scenarios: before.scenarios.map((scenario) => ({
      ...scenario,
      obligations: [],
      rating: 1,
    })),
  });

  const result = run(
    root,
    CLI,
    "architecture",
    "compare",
    before.id,
    "comparison-after",
    "--json"
  );

  assert.equal(result.comparable, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.before.freshness.status, "stale");
  assert.equal(result.after.freshness.status, "current");
  assert.equal(result.changes.value, 0.5);
  assert.equal(result.changes.avoidableObligations, -1);
  assert.equal(result.before.assessment.measurements.avoidableObligations, 1);
  assert.equal(result.after.assessment.measurements.avoidableObligations, 0);

  const report = run(
    root,
    CLI,
    "architecture",
    "compare-report",
    before.id,
    "comparison-after",
    "--no-open"
  );

  const html = readFileSync(report.path, "utf-8");
  assert.match(html, /Architecture comparison/u);
  assert.match(html, /historical/u);
  assert.match(html, /&lt;script&gt;/u);
  assert.doesNotMatch(html, /<script/iu);
  assert.deepEqual(readFileSync(join(state, "events.jsonl")), events);
});

test("comparisons reject changed questions, membership and unavailable evidence without inventing deltas", (t) => {
  const root = fixture(t);
  const before = input("fixed");
  record(root, before);

  for (const candidate of [
    {
      ...before,
      id: "question",
      scenarios: before.scenarios.map((scenario) => ({
        ...scenario,
        description: "A different question",
      })),
    },
    {
      ...before,
      id: "membership",
      module: { ...before.module, members: ["module.ts", "caller.ts"] },
    },
    {
      ...before,
      id: "missing",
      scenarios: before.scenarios.map((scenario) => ({
        ...scenario,
        rating: null,
      })),
    },
    { ...before, id: "empty", scenarios: [] },
    { ...before, exclusions: ["Ignore retry obligation"], id: "excluded" },
  ]) {
    record(root, candidate);

    const result = run(
      root,
      CLI,
      "architecture",
      "compare",
      before.id,
      candidate.id,
      "--json"
    );

    assert.equal(result.comparable, false, candidate.id);
    assert.ok(result.reasons.length > 0);
    assert.deepEqual(Object.values(result.changes), [null, null, null]);
  }

  record(root, { ...before, id: "unchanged" });

  const unchanged = run(
    root,
    CLI,
    "architecture",
    "compare",
    before.id,
    "unchanged",
    "--json"
  );

  assert.equal(unchanged.comparable, true);
  assert.equal(unchanged.changes.value, 0);
  record(root, {
    ...before,
    id: "regression",
    scenarios: before.scenarios.map((scenario) => ({ ...scenario, rating: 0 })),
  });

  const regression = run(
    root,
    CLI,
    "architecture",
    "compare",
    before.id,
    "regression",
    "--json"
  );

  assert.equal(regression.changes.value, -0.5);
});
