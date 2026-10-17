import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
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
  LocalityAssessmentInput,
  LocalityRule,
} from "../scripts/architecture/locality.ts";

const CLI = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));

function fixture(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "locality-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
    ["config", "user.name", "Learner"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(
    join(root, "policy.ts"),
    "const minimum = 10;\nconst secondMinimum = 10;\nuse(minimum);\n"
  );
  writeFileSync(join(root, "other.ts"), "export const minimum = 10;\n");
  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);
  run(root, CLI, "init");

  return root;
}

function run(root: string, cli: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

function input(id: string): LocalityAssessmentInput {
  return {
    changes: [
      {
        affectedOwners: ["Sales", "Checkout"],
        description: "Raise minimum amount",
        evidence: ["policy.ts"],
        id: "raise-minimum",
      },
    ],
    dimension: "change-locality",
    disagreements: [],
    evidence: [],
    exclusions: [],
    id,
    limitations: [],
    module: {
      id: "orders",
      interface: ["policy.ts"],
      members: ["policy.ts", "other.ts"],
    },
    review: {
      confidence: "medium",
      notes: "Compared both rules",
      reviewer: "Learner",
      status: "reviewed",
    },
    rules: [
      {
        description: "Minimum order",
        equivalence: "Both govern the same minimum order amount",
        evidence: ["policy.ts"],
        id: "minimum",
        sites: [
          {
            evidence: ["policy.ts"],
            file: "policy.ts",
            id: "one",
            implementation: null,
            location: "line 1",
            reason: "Independent minimum",
            role: "policy",
            trustBoundary: null,
          },
          {
            evidence: ["policy.ts"],
            file: "policy.ts",
            id: "two",
            implementation: null,
            location: "line 2",
            reason: "Independent copied minimum",
            role: "policy",
            trustBoundary: null,
          },
          {
            evidence: ["policy.ts"],
            file: "policy.ts",
            id: "call",
            implementation: "one",
            location: "line 3",
            reason: "Delegates to shared policy",
            role: "call",
            trustBoundary: null,
          },
        ],
        status: "confirmed",
      },
    ],
  };
}

function record(root: string, value: LocalityAssessmentInput, cli = CLI) {
  return run(root, cli, "architecture", "record", JSON.stringify(value));
}

test("locality counts independent policy sites in the same file while calls and affected owners stay separate", (t) => {
  const root = fixture(t);
  const events = readFileSync(join(root, ".keepup/events.jsonl"));
  const history = readFileSync(join(root, ".keepup/history.jsonl"));
  const assessment = record(root, input("locality"));
  assert.equal(assessment.measurements.value, 0.5);
  assert.equal(assessment.measurements.independentPolicySites, 2);
  assert.equal(assessment.measurements.calls, 1);
  assert.equal(assessment.measurements.denominator, 1);
  assert.equal(
    assessment.observation.rubric,
    "experimental-change-locality-v1"
  );

  const report = run(
    root,
    CLI,
    "architecture",
    "report",
    "locality",
    "--no-open"
  );

  const html = readFileSync(report.path, "utf-8");
  assert.match(
    html,
    /Independent policy sites: 2; calls: 1; confirmed rules: 1/u
  );
  assert.match(html, /Sales/u);
  const source = input("different-owners");

  const ownersChanged = record(root, {
    ...source,
    changes: source.changes.map((change) => ({
      ...change,
      affectedOwners: ["Finance"],
    })),
  });

  assert.equal(ownersChanged.measurements.value, assessment.measurements.value);
  assert.notEqual(ownersChanged.inputDigest, assessment.inputDigest);
  assert.deepEqual(readFileSync(join(root, ".keepup/events.jsonl")), events);
  assert.deepEqual(readFileSync(join(root, ".keepup/history.jsonl")), history);
});

test("proposals, unclear equivalence, missing sites and incomplete evidence never become perfect locality", (t) => {
  const root = fixture(t);
  const source = input("proposal");

  const proposal = record(root, {
    ...source,
    disagreements: ["Reviewer questions policy equivalence"],
    exclusions: ["Legacy service excluded until investigated"],
    review: { ...source.review, status: "provisional" },
    rules: source.rules.map((rule) => ({ ...rule, status: "proposed" })),
  });

  assert.equal(proposal.measurements.value, null);
  assert.equal(proposal.measurements.denominator, 0);
  assert.equal(proposal.measurements.proposedRules, 1);
  assert.equal(proposal.input.review.status, "provisional");
  assert.match(
    proposal.limitations.join(" "),
    /Reviewer questions policy equivalence/u
  );
  const approved = record(root, { ...source, id: "approved" });
  assert.equal(approved.measurements.value, 0.5);
  assert.equal(
    run(root, CLI, "architecture", "inspect", "proposal", "--json").assessment
      .input.review.status,
    "provisional"
  );

  for (const [id, rules] of [
    ["empty", []],
    ["absent", source.rules.map((rule) => ({ ...rule, sites: [] }))],
    ["missing", source.rules.map((rule) => ({ ...rule, evidence: [] }))],
    [
      "unclear",
      source.rules.map((rule): LocalityRule => ({
        ...rule,
        status: "unclear",
      })),
    ],
  ] as const) {
    const result = record(root, { ...source, id, rules });
    assert.equal(result.measurements.value, null);
    assert.equal(result.measurements.status, "unavailable");
    assert.ok(result.limitations.length);
  }
});

test("calibration recognises consolidation, rejects file merging and retains necessary trust-boundary validation", (t) => {
  const root = fixture(t);
  const source = input("before");

  const checkBehaviour = () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import assert from 'node:assert/strict'; import { checkout } from './policy.ts'; import { queue } from './other.ts'; for (const accepts of [checkout, queue]) assert.deepEqual([9, 10, 11, NaN, '10'].map(accepts), [false, true, true, false, false]);",
      ],
      { cwd: root, encoding: "utf-8" }
    );

    assert.equal(result.status, 0, result.stderr);
  };

  const checkout =
    "export const checkout = (amount) => Number.isFinite(amount) && amount >= 10;\n";

  const queue =
    "export const queue = (amount) => Number.isFinite(amount) && amount >= 10;\n";

  writeFileSync(join(root, "policy.ts"), checkout);
  writeFileSync(join(root, "other.ts"), queue);
  checkBehaviour();

  const split = record(root, {
    ...source,
    rules: source.rules.map((rule) => ({
      ...rule,
      sites: rule.sites.map((site) =>
        site.id === "two" ? { ...site, file: "other.ts" } : site
      ),
    })),
  });

  writeFileSync(join(root, "policy.ts"), checkout + queue);
  writeFileSync(
    join(root, "other.ts"),
    "export { queue } from './policy.ts';\n"
  );
  checkBehaviour();
  const mergedFiles = record(root, { ...source, id: "merged-files" });
  assert.equal(split.measurements.independentPolicySites, 2);
  assert.equal(mergedFiles.measurements.value, split.measurements.value);

  writeFileSync(
    join(root, "policy.ts"),
    "const minimum = 10;\nconst accepts = (amount) => Number.isFinite(amount) && amount >= minimum;\nexport const checkout = accepts;\nexport const queue = accepts;\n"
  );
  checkBehaviour();

  const consolidated = record(root, {
    ...source,
    id: "consolidated",
    rules: source.rules.map((rule) => ({
      ...rule,
      sites: rule.sites.filter((site) => site.id !== "two"),
    })),
  });

  assert.equal(consolidated.measurements.value, 1);
  assert.equal(consolidated.measurements.independentPolicySites, 1);

  writeFileSync(join(root, "policy.ts"), checkout + queue);
  checkBehaviour();

  const boundaries = record(root, {
    ...source,
    id: "boundaries",
    rules: source.rules.map((rule) => ({
      ...rule,
      sites: rule.sites.map((site) =>
        site.role === "policy"
          ? {
              ...site,
              reason: "Each input requires its own validation",
              trustBoundary:
                site.id === "one" ? "public API" : "queue consumer",
            }
          : site
      ),
    })),
  });

  assert.equal(boundaries.measurements.value, 0.5);
  assert.match(
    boundaries.limitations.join(" "),
    /preserve justified validation at public API/u
  );
  assert.match(boundaries.limitations.join(" "), /queue consumer/u);
});

test("copied-install locality reports preserve evidence and reject malformed policy inventories", (t) => {
  const root = fixture(t);
  const installed = join(root, "copied-skill");
  cpSync(dirname(dirname(CLI)), installed, { recursive: true });
  const cli = join(installed, "scripts/keepup.mjs");
  const original = record(root, input("copied"), cli);
  assert.equal(
    run(root, cli, "architecture", "inspect", "copied", "--json").freshness
      .status,
    "current"
  );
  writeFileSync(join(root, "other.ts"), "export const minimum = 20;\n");
  assert.equal(
    run(root, cli, "architecture", "inspect", "copied", "--json").freshness
      .status,
    "stale"
  );
  assert.deepEqual(record(root, input("copied"), cli), original);

  const report = run(
    root,
    cli,
    "architecture",
    "report",
    "copied",
    "--no-open"
  );

  assert.match(readFileSync(report.path, "utf-8"), /Minimum order/u);
  const source = input("bad");
  const [rule] = source.rules;
  assert.ok(rule);
  const [first] = rule.sites;
  assert.ok(first);

  for (const sites of [
    [first, first],
    [{ ...first, implementation: "absent", role: "call" }],
    [{ ...first, evidence: ["../escape.ts"] }],
  ]) {
    const failed: SpawnSyncReturns<Buffer> = spawnSync(
      process.execPath,
      [
        cli,
        "architecture",
        "record",
        JSON.stringify({ ...source, rules: [{ ...rule, sites }] }),
      ],
      { cwd: root }
    );

    assert.equal(failed.status, 1);
  }

  assert.deepEqual(run(root, cli, "architecture", "list"), ["copied"]);
});

test("locality comparisons keep the rule question fixed while exposing raw consolidation and inventory changes", (t) => {
  const root = fixture(t);
  const before = input("before-comparison");

  const after = {
    ...before,
    changes: before.changes.map((change) => ({
      ...change,
      affectedOwners: ["Sales"],
    })),
    id: "after-comparison",
    rules: before.rules.map((rule) => ({
      ...rule,
      sites: rule.sites.filter((site) => site.id !== "two"),
    })),
  };

  run(root, CLI, "architecture", "record", JSON.stringify(before));
  run(root, CLI, "architecture", "record", JSON.stringify(after));

  const compared = run(
    root,
    CLI,
    "architecture",
    "compare",
    before.id,
    after.id,
    "--json"
  );

  assert.equal(compared.comparable, true);
  assert.equal(compared.changes.independentPolicySites, -1);
  assert.deepEqual(compared.before.assessment.input.changes[0].affectedOwners, [
    "Sales",
    "Checkout",
  ]);
  assert.deepEqual(compared.after.assessment.input.changes[0].affectedOwners, [
    "Sales",
  ]);
  assert.ok(compared.changes.value > 0);
  assert.equal(
    compared.before.assessment.measurements.rules[0].independentPolicySites,
    2
  );
  assert.equal(
    compared.after.assessment.measurements.rules[0].independentPolicySites,
    1
  );

  for (const candidate of [
    {
      ...after,
      id: "different-rule",
      rules: after.rules.map((rule) => ({
        ...rule,
        equivalence: "Different policy meaning",
      })),
    },
    {
      ...after,
      changes: after.changes.map((change) => ({
        ...change,
        description: "A different future change",
      })),
      id: "different-change",
    },
  ]) {
    run(root, CLI, "architecture", "record", JSON.stringify(candidate));

    const rejected = run(
      root,
      CLI,
      "architecture",
      "compare",
      before.id,
      candidate.id,
      "--json"
    );

    assert.equal(rejected.comparable, false);
    assert.equal(rejected.changes.value, null);
    assert.equal(rejected.changes.independentPolicySites, null);
  }
});
