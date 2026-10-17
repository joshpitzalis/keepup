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
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));

test("copied installation reports supported practice separately from target preparation without credit", (t) => {
  const root = mkdtempSync(join(tmpdir(), "exercise-capabilities-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "learner@example.com"],
  ]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }

  writeFileSync(join(root, "policy.ts"), "export const save = () => 1;\n");
  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);
  const installed = join(root, "installed");
  cpSync(dirname(dirname(CLI)), installed, { recursive: true });
  const cli = join(installed, "scripts/keepup.mjs");

  function run(...args: string[]) {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: "utf-8",
    });

    assert.equal(result.status, 0, result.stderr);

    return JSON.parse(result.stdout);
  }

  run("init");
  const events = readFileSync(join(root, ".keepup/events.jsonl"));
  const capabilities = run("architecture", "capabilities");
  assert.deepEqual(
    capabilities.map((entry: { dimension: string }) => entry.dimension),
    [
      "file-health",
      "interface-leverage",
      "seam-integrity",
      "change-locality",
      "navigability",
      "behavioural-testability",
    ]
  );
  assert.deepEqual(
    capabilities
      .filter((entry: { supported: boolean }) => entry.supported)
      .map((entry: { dimension: string }) => entry.dimension),
    ["file-health", "seam-integrity", "change-locality"]
  );
  assert.ok(
    capabilities.every(
      (entry: { readiness: string }) => entry.readiness !== "ready"
    )
  );
  assert.deepEqual(run("status", "--json").exerciseCapabilities, capabilities);
  const health = run("health", "[]");
  assert.equal(health.attemptedDimensions, 1);
  assert.equal(health.measuredDimensions, health.assessedDimensions);
  assert.deepEqual(health.exerciseCapabilities, capabilities);
  assert.deepEqual(readFileSync(join(root, ".keepup/events.jsonl")), events);
  assert.equal(run("status", "--json").katas.length, 0);
});
