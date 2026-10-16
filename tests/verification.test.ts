import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

const RUNNER = new URL("../scripts/verify.ts", import.meta.url).pathname;
const TOOL = process.env.KEEPUP_TEST_ANALYSER_DIRECTORY;

const INSTALLER = new URL("../scripts/install-agent-skills.ts", import.meta.url)
  .pathname;

const LEFTHOOK = new URL(
  "../node_modules/lefthook/bin/index.js",
  import.meta.url
).pathname;

test("local skill overrides install with a backup and detect installed drift", (t) => {
  const root = mkdtempSync(join(tmpdir(), "keepup-skills-test-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const destination = join(root, "skills");
  mkdirSync(join(destination, "cbp"), { recursive: true });
  writeFileSync(join(destination, "cbp/SKILL.md"), "local customization");

  const install = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [INSTALLER, "--directory", destination, ...args],
      { encoding: "utf-8" }
    );

  assert.equal(install().status, 0);
  assert.equal(install("--check").status, 0);
  const [backup] = readdirSync(join(root, "skill-backups"));
  assert.ok(backup);
  assert.equal(
    readFileSync(join(root, "skill-backups", backup, "cbp/SKILL.md"), "utf-8"),
    "local customization"
  );
  writeFileSync(join(destination, "cbp/SKILL.md"), "drift");
  assert.notEqual(install("--check").status, 0);
  assert.notEqual(install("--unknown").status, 0);
});

test("Lefthook blocks an invalid commit and allows the corrected candidate", (t) => {
  const root = fixture(t);
  writeFileSync(
    join(root, "lefthook.yml"),
    readFileSync(new URL("../lefthook.yml", import.meta.url))
  );

  const installed = spawnSync(process.execPath, [LEFTHOOK, "install"], {
    cwd: root,
    encoding: "utf-8",
  });

  assert.equal(installed.status, 0, installed.stderr);
  writeFileSync(join(root, "check.test.mjs"), "const invalid = ;\n");
  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);

  const commit = () =>
    spawnSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-qm",
        "candidate",
      ],
      { cwd: root, encoding: "utf-8" }
    );

  assert.notEqual(commit().status, 0);
  assert.equal(
    spawnSync("git", ["log", "-1", "--format=%s"], {
      cwd: root,
      encoding: "utf-8",
    }).stdout.trim(),
    "fixture"
  );
  writeFileSync(join(root, "check.test.mjs"), "export const valid = true;\n");
  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0);
  const corrected = commit();
  assert.equal(corrected.status, 0, corrected.stdout + corrected.stderr);
});

function fixture(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "keepup-verify-test-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      private: true,
      scripts: {
        check: "node --check check.test.mjs",
        test: "node --test --test-reporter=tap check.test.mjs",
        typecheck: "node --check check.test.mjs",
      },
    })
  );
  writeFileSync(join(root, "input.txt"), "original");
  writeFileSync(
    join(root, "check.test.mjs"),
    `
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import test from 'node:test';
test('frozen input', () => {
  writeFileSync(process.env.LIVE_INPUT, 'changed during run');
  assert.equal(readFileSync(new URL('./input.txt', import.meta.url), 'utf8'), 'original');
});
`
  );

  for (const args of [
    ["init", "-q"],
    ["add", "."],
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "fixture",
    ],
  ]) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
    assert.equal(result.status, 0, result.stderr);
  }

  return root;
}

function run(
  root: string,
  tool?: string,
  ...args: string[]
): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      CI: undefined,
      KEEPUP_TEST_ANALYSER_DIRECTORY: tool,
      LIVE_INPUT: join(root, "input.txt"),
      NODE_TEST_CONTEXT: undefined,
    },
    timeout: 60_000,
  });
}

test("verification fails before running checks when pinned analyser prerequisites are missing or wrong", (t) => {
  const root = fixture(t);
  const missing = run(root);
  assert.notEqual(missing.status, 0);
  assert.match(String(missing.stderr), /KEEPUP_TEST_ANALYSER_DIRECTORY/u);
  const tool = join(root, "bad-tool");
  mkdirSync(join(tool, "node_modules/dependency-cruiser"), { recursive: true });
  writeFileSync(
    join(tool, "node_modules/dependency-cruiser/package.json"),
    '{"version":"0.0.0"}'
  );
  const wrong = run(root, tool);
  assert.notEqual(wrong.status, 0);
  assert.match(String(wrong.stderr), /18\.6\.0/u);
  assert.equal(readFileSync(join(root, "input.txt"), "utf-8"), "original");
});

test(
  "verification freezes live bytes and reuses only an exact successful receipt",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    const first = run(root, TOOL);
    assert.equal(first.status, 0, String(first.stderr));
    assert.equal(
      readFileSync(join(root, "input.txt"), "utf-8"),
      "changed during run"
    );
    writeFileSync(join(root, "input.txt"), "original");
    const reused = run(root, TOOL, "--reuse");
    assert.equal(reused.status, 0, String(reused.stderr));
    assert.match(String(reused.stdout), /Reusing passed receipt/u);
    assert.equal(readFileSync(join(root, "input.txt"), "utf-8"), "original");
    writeFileSync(join(root, "input.txt"), "different candidate");
    const changed = run(root, TOOL, "--reuse");
    assert.notEqual(changed.status, 0);
    assert.doesNotMatch(String(changed.stdout), /Reusing passed receipt/u);
  }
);

test(
  "verification rejects an exit-zero suite with skipped behavior",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    writeFileSync(
      join(root, "check.test.mjs"),
      "import test from 'node:test'; test('behavior', {skip:true},()=>{});\n"
    );
    const result = run(root, TOOL);
    assert.notEqual(result.status, 0);
    assert.match(String(result.stderr), /skipped|complete/u);
  }
);

test(
  "verification refuses a receipt when checks mutate their frozen source",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);
    writeFileSync(
      join(root, "check.test.mjs"),
      "import test from 'node:test'; import {writeFileSync} from 'node:fs'; test('mutation',()=>writeFileSync(new URL('./input.txt',import.meta.url),'mutated'));\n"
    );
    const result = run(root, TOOL);
    assert.notEqual(result.status, 0);
    assert.match(String(result.stderr), /Frozen source changed/u);
    assert.equal(readFileSync(join(root, "input.txt"), "utf-8"), "original");
  }
);

test(
  "CI executes fresh checks even when receipt reuse is requested",
  { skip: !TOOL },
  (t) => {
    const root = fixture(t);

    const check = () =>
      spawnSync(process.execPath, [RUNNER, "--reuse"], {
        cwd: root,
        encoding: "utf-8",
        env: {
          ...process.env,
          CI: "true",
          KEEPUP_TEST_ANALYSER_DIRECTORY: TOOL,
          LIVE_INPUT: join(root, "input.txt"),
          NODE_TEST_CONTEXT: undefined,
        },
        timeout: 60_000,
      });

    const first = check();
    assert.equal(first.status, 0, first.stderr);
    writeFileSync(join(root, "input.txt"), "original");
    const second = check();
    assert.equal(second.status, 0, second.stderr);
    assert.doesNotMatch(second.stdout, /Reusing passed receipt/u);
    assert.equal(
      readFileSync(join(root, "input.txt"), "utf-8"),
      "changed during run"
    );
  }
);
