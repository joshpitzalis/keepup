import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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

function run(root: string, cli: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

function fixture(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "opportunity-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "policy.ts"), "export const save = () => 1;\n");
  writeFileSync(join(root, "policy.test.ts"), "// Existing test fixture\n");
  writeFileSync(
    join(root, "ADR.md"),
    "Keep retry validation at the caller boundary.\n"
  );
  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);
  run(root, CLI, "init");
  const config = join(root, ".keepup/config.json");
  writeFileSync(
    config,
    JSON.stringify({
      ...JSON.parse(readFileSync(config, "utf-8")),
      testCommand: "node --test policy.test.ts",
    })
  );
  run(
    root,
    CLI,
    "architecture",
    "record",
    JSON.stringify({
      dimension: "interface-leverage",
      evidence: [],
      exclusions: [],
      id: "baseline",
      limitations: [],
      module: {
        id: "orders",
        interface: ["policy.ts"],
        members: ["policy.ts"],
      },
      review: {
        confidence: "medium",
        notes: "Reviewed caller",
        reviewer: "Learner",
        status: "reviewed",
      },
      scenarios: [
        {
          description: "Save order",
          evidence: ["policy.ts"],
          id: "save",
          obligations: [
            {
              classification: "avoidable",
              description: "Configure retry",
              evidence: ["policy.ts"],
              kind: "configuration",
            },
          ],
          rating: 0.5,
          rationale: "Caller owns retry configuration",
        },
      ],
    })
  );

  return root;
}

function opportunity(id: string) {
  return {
    behaviour: "Save an order through the public interface",
    conflicts: [],
    context: {
      documents: [],
      mission: "Simplify order checkout",
      nextChange: "Add order retry handling",
    },
    decision: "refactor",
    findings: [
      {
        assessmentId: "baseline",
        description: "Caller owns retry setup",
        evidence: ["policy.ts"],
      },
    ],
    id,
    limitations: [],
    modules: ["orders"],
    outcome: "Move avoidable retry setup behind the intended interface",
    rawTarget: {
      assessmentId: "baseline",
      goal: 0,
      metric: "avoidableObligations",
    },
    relevance: "The next checkout change must configure retries",
    risks: ["Retry handling may hide a failed save"],
    scope: ["policy.ts"],
    stopCondition: "Stop if retry ownership crosses the trust boundary",
    strength: "strong",
    verification: {
      evidence: ["policy.test.ts"],
      invariants: ["Save retains existing failure behavior"],
      readiness: "reviewed-ready",
      testCommand: "node --test policy.test.ts",
    },
  };
}

test("mission-relevant bounded opportunities retain evidence and qualitative readiness without learning credit", (t) => {
  const root = fixture(t);
  const events = readFileSync(join(root, ".keepup/events.jsonl"));

  const result = run(
    root,
    CLI,
    "architecture",
    "opportunity",
    "record",
    JSON.stringify(opportunity("candidate"))
  );

  assert.equal(result.decision, "refactor");
  assert.equal(result.strength, "strong");
  assert.equal(result.target.baseline, 1);
  assert.equal(result.target.goal, 0);
  assert.equal(result.exerciseAvailable, false);

  const inspected = run(
    root,
    CLI,
    "architecture",
    "opportunity",
    "inspect",
    "candidate",
    "--json"
  );

  assert.deepEqual(inspected.opportunity, result);
  assert.equal(inspected.freshness.status, "current");

  const report = run(
    root,
    CLI,
    "architecture",
    "opportunity",
    "report",
    "candidate",
    "--no-open"
  );

  assert.match(readFileSync(report.path, "utf-8"), /Architecture opportunity/u);
  assert.match(readFileSync(report.path, "utf-8"), /Retry handling may hide/u);
  assert.deepEqual(readFileSync(join(root, ".keepup/events.jsonl")), events);
});

test("opportunity rehearsals defer speculative and conflicting work, prepare tests, and allow no useful refactor", (t) => {
  const root = fixture(t);
  const base = opportunity("rehearsal");

  const examples = [
    {
      decision: "defer",
      input: {
        ...base,
        context: { documents: [], mission: null, nextChange: null },
        id: "speculative",
        relevance: null,
      },
      reason: /No supplied/u,
    },
    {
      decision: "defer",
      input: {
        ...base,
        conflicts: [
          {
            description: "Moving retry contradicts caller-boundary decision",
            document: "ADR.md",
          },
        ],
        context: { ...base.context, documents: ["ADR.md"] },
        id: "adr-conflict",
      },
      reason: /ADR conflict/u,
    },
    {
      decision: "preparation",
      input: {
        ...base,
        id: "test-preparation",
        verification: { ...base.verification, readiness: "inadequate" },
      },
      reason: /tests are inadequate/u,
    },
    {
      decision: "none",
      input: {
        ...base,
        decision: "none",
        findings: [],
        id: "no-useful-work",
        modules: [],
        outcome: "No bounded refactor pays off under the supplied mission",
        rawTarget: null,
        scope: [],
      },
      reason: /findings are missing/u,
    },
  ];

  for (const example of examples) {
    const result = run(
      root,
      CLI,
      "architecture",
      "opportunity",
      "record",
      JSON.stringify(example.input)
    );

    assert.equal(result.decision, example.decision);
    assert.match(result.reasons.join(" "), example.reason);
    assert.equal(result.exerciseAvailable, false);

    if (example.input.id === "speculative") {
      assert.equal(result.strength, "speculative");
    }
  }

  const conflict = run(
    root,
    CLI,
    "architecture",
    "opportunity",
    "inspect",
    "adr-conflict",
    "--json"
  );

  assert.equal(
    conflict.opportunity.contextDocuments[0].text,
    "Keep retry validation at the caller boundary.\n"
  );
  const adr = readFileSync(join(root, "ADR.md"), "utf-8");
  assert.equal(adr, "Keep retry validation at the caller boundary.\n");
  writeFileSync(join(root, "policy.ts"), "export const save = () => 2;\n");

  const stale = run(
    root,
    CLI,
    "architecture",
    "opportunity",
    "record",
    JSON.stringify({ ...base, id: "stale" })
  );

  assert.equal(stale.decision, "assessment");
  assert.match(stale.reasons.join(" "), /Current complete accepted findings/u);
});

test("copied opportunities preserve immutable retries, reject protected input and expose stale context", (t) => {
  const root = fixture(t);
  const installed = join(root, "installed");
  cpSync(dirname(dirname(CLI)), installed, { recursive: true });
  const cli = join(installed, "scripts/keepup.mjs");

  const input = {
    ...opportunity("copied"),
    context: { ...opportunity("copied").context, documents: ["ADR.md"] },
  };

  const result = run(
    root,
    cli,
    "architecture",
    "opportunity",
    "record",
    JSON.stringify(input)
  );

  assert.deepEqual(
    run(
      root,
      cli,
      "architecture",
      "opportunity",
      "record",
      JSON.stringify(input)
    ),
    result
  );
  const path = join(root, ".keepup/architecture/opportunities/copied.json");
  const bytes = readFileSync(path);

  for (const candidate of [
    { ...input, outcome: "Conflicting retry" },
    { ...input, id: "forged", observation: { observer: "someone else" } },
    { ...input, id: "escaped", scope: ["../outside"] },
  ]) {
    const rejected = spawnSync(
      process.execPath,
      [cli, "architecture", "opportunity", "record", JSON.stringify(candidate)],
      { cwd: root, encoding: "utf-8" }
    );

    assert.equal(rejected.status, 1);
  }

  assert.deepEqual(readFileSync(path), bytes);
  writeFileSync(join(root, "ADR.md"), "A changed decision\n");

  const inspected = run(
    root,
    cli,
    "architecture",
    "opportunity",
    "inspect",
    "copied",
    "--json"
  );

  assert.equal(inspected.freshness.status, "stale");
  assert.deepEqual(inspected.opportunity, result);
  assert.deepEqual(
    run(
      root,
      cli,
      "architecture",
      "opportunity",
      "record",
      JSON.stringify(input)
    ),
    result
  );
});

test("concurrent opportunity retries publish one immutable observation and malformed stored data stays untouched", async (t) => {
  const root = fixture(t);
  const value = opportunity("concurrent");

  const invoke = () =>
    // oxlint-disable-next-line promise/avoid-new -- Child process events exercise the public concurrent CLI publication seam.
    new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [CLI, "architecture", "opportunity", "record", JSON.stringify(value)],
        { cwd: root }
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
  const path = join(root, ".keepup/architecture/opportunities/concurrent.json");
  const original = readFileSync(path, "utf-8");
  writeFileSync(path, original.slice(0, -2));
  const partial = readFileSync(path);

  const result = spawnSync(
    process.execPath,
    [CLI, "architecture", "opportunity", "record", JSON.stringify(value)],
    { cwd: root }
  );

  assert.equal(result.status, 1);
  assert.deepEqual(readFileSync(path), partial);
});
