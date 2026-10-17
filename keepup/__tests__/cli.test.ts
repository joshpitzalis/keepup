import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  chmodSync,
  renameSync,
  cpSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import type { CommandResults, Status, StoredEvent } from "../scripts/keepup.ts";

const cli = fileURLToPath(new URL("../scripts/keepup.mjs", import.meta.url));

function command(cwd: string, executable: string, args: string[]) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr);

  return result.stdout;
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "keepup-test-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  command(root, "git", ["init", "-q"]);
  command(root, "git", ["config", "user.email", "learner@example.com"]);
  command(root, "git", ["config", "user.name", "Learner"]);

  return realpathSync(root);
}

function run<K extends keyof CommandResults>(
  root: string,
  name: K,
  ...args: string[]
): CommandResults[K] {
  return JSON.parse(command(root, process.execPath, [cli, name, ...args]));
}

test("initialise from a subdirectory, correct scope, and rerun without losing learning state", (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/example.js"), "export const answer = 42;\n");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { test: "node --test" } })
  );
  writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
  command(root, "git", ["add", "."]);
  const initial = run(join(root, "src"), "init");
  assert.equal(initial.root, resolvePath(root));
  assert.equal(initial.config.testCommand, "pnpm test");
  assert.ok(initial.files.includes("src/example.js"));
  const { state } = initial;

  const config = {
    ...initial.config,
    exclude: [],
    include: ["src/**/*.js"],
    testCommand: "node --test",
  };

  writeFileSync(join(state, "config.json"), JSON.stringify(config));
  writeFileSync(join(state, "MISSION.md"), "My mission\n");
  writeFileSync(join(state, "events.jsonl"), '{"preserve":"event"}\n');
  writeFileSync(join(state, "scorers/custom"), "#!/bin/sh\n");
  const again = run(root, "init");
  assert.deepEqual(again.config, config);
  assert.deepEqual(again.files, ["src/example.js"]);
  assert.equal(
    readFileSync(join(state, "MISSION.md"), "utf-8"),
    "My mission\n"
  );
  assert.equal(
    readFileSync(join(state, "events.jsonl"), "utf-8"),
    '{"preserve":"event"}\n'
  );
  assert.equal(
    readFileSync(join(state, "scorers/custom"), "utf-8"),
    "#!/bin/sh\n"
  );
  assert.equal(
    readFileSync(join(root, ".gitignore"), "utf-8"),
    ".keepup/map.html\n"
  );
});

test("unknown test command stays unset and linked worktrees share the main state", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "example.py"), "answer = 42\n");
  command(root, "git", ["add", "."]);
  command(root, "git", ["commit", "-qm", "fixture"]);
  const initial = run(root, "init");
  assert.equal(initial.config.testCommand, null);
  const worktree = join(root, "linked");
  command(root, "git", ["worktree", "add", "-qb", "exercise", worktree]);
  const linked = run(worktree, "init");
  assert.equal(linked.root, root);
  assert.equal(linked.state, initial.state);
  assert.deepEqual(linked.files, ["example.py"]);
});

function scoringFixture(t: TestContext) {
  const root = fixture(t);
  writeFileSync(join(root, "small.ts"), "a\nb\n");
  writeFileSync(join(root, "large.py"), "a\nb\nc\nd\n");
  command(root, "git", ["add", "."]);
  run(root, "init");
  rmSync(join(root, ".keepup/scorers"), { recursive: true });
  mkdirSync(join(root, ".keepup/scorers"));

  return root;
}

test("init adopts a dated starter mission, upgrades only the untouched template and preserves the trial on rerun", (t) => {
  const root = fixture(t);
  const state = join(root, ".keepup");

  const initializeAt = (time: string) => {
    const result = spawnSync(process.execPath, [cli, "init"], {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, KEEPUP_NOW: time },
    });

    assert.equal(result.status, 0, result.stderr);
  };

  initializeAt("2026-10-17T12:00:00Z");
  const mission = readFileSync(join(state, "MISSION.md"), "utf-8");
  assert.match(mission, /make informed product decisions/u);
  assert.match(mission, /hands-on code exploration and refactoring/u);
  assert.match(
    mission,
    /keepup-starter-review-after: 2026-10-24T12:00:00.000Z/u
  );
  assert.equal(readFileSync(join(state, "events.jsonl"), "utf-8"), "");
  initializeAt("2026-11-01T12:00:00Z");
  assert.equal(readFileSync(join(state, "MISSION.md"), "utf-8"), mission);

  writeFileSync(
    join(state, "MISSION.md"),
    "# Mission\n\n## Why\n\n## Success\n\n## Constraints\n\n## Exclusions\n"
  );
  initializeAt("2026-11-01T12:00:00Z");
  assert.match(
    readFileSync(join(state, "MISSION.md"), "utf-8"),
    /keepup-starter-review-after: 2026-11-08T12:00:00.000Z/u
  );
  writeFileSync(
    join(state, "MISSION.md"),
    "# Mission\n\n## Why\nMy own reason.\n"
  );
  initializeAt("2026-12-01T12:00:00Z");
  assert.equal(
    readFileSync(join(state, "MISSION.md"), "utf-8"),
    "# Mission\n\n## Why\nMy own reason.\n"
  );
});

function scorer(root: string, name: string, body: string) {
  const path = join(root, ".keepup/scorers", name);
  writeFileSync(path, `#!/usr/bin/env node\n${body}`);
  chmodSync(path, 0o755);
}

test("keepup reuses legacy learning state and scorer contracts without splitting history", (t) => {
  const root = scoringFixture(t);
  scorer(
    root,
    "legacy",
    `if (process.env.COGDEBT_STATE !== process.env.KEEPUP_STATE || process.env.COGDEBT_LEARNER !== 'learner@example.com') throw new Error('Legacy scorer contract lost'); console.log(JSON.stringify({file:'small.ts',metric:'complexity',value:0.5}));`
  );
  run(
    root,
    "log",
    JSON.stringify({
      depth: "paragraph",
      files: ["small.ts"],
      id: "old-card",
      type: "shown",
    })
  );
  renameSync(join(root, ".keepup"), join(root, ".cogdebt"));
  const before = readFileSync(join(root, ".cogdebt/events.jsonl"), "utf-8");
  command(root, "git", ["add", "."]);
  const setup = run(root, "init");
  assert.equal(setup.state, join(root, ".cogdebt"));
  assert.deepEqual(setup.files, ["large.py", "small.ts"]);
  assert.equal(
    readFileSync(join(setup.state, "events.jsonl"), "utf-8"),
    before
  );

  const file = run(root, "status", "--json").files.find(
    (item) => item.file === "small.ts"
  );

  assert.equal(file?.state, "exposed");
  assert.equal(file?.metrics.complexity?.value, 0.5);

  const event = {
    depth: "line",
    files: ["small.ts"],
    id: "legacy-clock",
    type: "shown",
  };

  const logged = spawnSync(
    process.execPath,
    [cli, "log", JSON.stringify(event)],
    {
      cwd: root,
      encoding: "utf-8",
      env: {
        ...process.env,
        COGDEBT_NOW: "2026-10-16T12:00:00Z",
        KEEPUP_NOW: "",
      },
    }
  );

  assert.equal(logged.status, 0, logged.stderr);
  assert.equal(JSON.parse(logged.stdout).t, "2026-10-16T12:00:00.000Z");
  const events = readFileSync(join(setup.state, "events.jsonl"), "utf-8");
  mkdirSync(join(root, ".keepup"));

  const conflict = spawnSync(process.execPath, [cli, "init"], {
    cwd: root,
    encoding: "utf-8",
  });

  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /Both \.keepup and \.cogdebt/u);
  assert.equal(
    readFileSync(join(setup.state, "events.jsonl"), "utf-8"),
    events
  );
});

test("status scores a dark baseline, discovers metrics and compares learner-specific history", (t) => {
  const root = scoringFixture(t);
  scorer(
    root,
    "fixed",
    `process.stdin.resume(); console.log(JSON.stringify({file:'small.ts',metric:'complexity',value:1,raw:1,line:1,fn:'small'})); console.log(JSON.stringify({file:'large.py',metric:'complexity',value:0,raw:20,line:2,fn:'large'}));`
  );
  const first = run(root, "status", "--json");
  assert.equal(first.summary.cognitiveDebt, 1);
  assert.equal(first.summary.codeHealth, 1 / 3);
  assert.equal(first.summary.coverage.dark, 1);
  assert.equal(first.delta, null);
  assert.equal(first.files.find((f) => f.file === "small.ts")?.weight, 0.125);
  assert.equal(first.files.find((f) => f.file === "large.py")?.weight, 1);
  assert.equal(first.files[0]?.state, "dark");
  scorer(
    root,
    "second",
    `console.log(JSON.stringify({file:'large.py',metric:'other',value:1}));`
  );
  const second = run(root, "status", "--json");
  assert.deepEqual(second.metrics, ["complexity", "other"]);
  assert.equal(second.files.find((f) => f.file === "large.py")?.codeScore, 0.5);
  assert.equal(second.summary.codeHealth, 2 / 3);
  assert.ok((second.delta?.codeHealth ?? 0) > 0);
  assert.match(
    command(root, process.execPath, [cli, "status"]),
    /Cognitive debt: 100.0%/u
  );
  command(root, "git", ["config", "user.email", "another@example.com"]);
  assert.equal(run(root, "status", "--json").delta, null);
});

test("failed and malformed scorers do not hide healthy metrics or unknown debt", (t) => {
  const root = scoringFixture(t);
  scorer(root, "broken", `process.exit(2);`);
  scorer(
    root,
    "malformed",
    `console.log(JSON.stringify({file:'large.py',metric:'bad',value:1})); console.log('not-json');`
  );
  scorer(
    root,
    "healthy",
    `console.log(JSON.stringify({file:'small.ts',metric:'health',value:1}));`
  );
  const result = run(root, "status", "--json");
  assert.deepEqual(result.metrics, ["health"]);
  assert.equal(result.summary.codeHealth, 1);
  assert.equal(result.summary.scoredLineCoverage, 1 / 3);
  assert.equal(
    result.files.find((f) => f.file === "large.py")?.codeScore,
    null
  );
  assert.equal(result.summary.cognitiveDebt, 1);
  assert.ok(
    result.warnings.some((message) => message.includes("broken failed"))
  );
  assert.ok(
    result.warnings.some((message) =>
      message.includes("malformed output ignored")
    )
  );
  rmSync(join(root, ".keepup/scorers/healthy"));
  const unknown = run(root, "status", "--json");
  assert.equal(unknown.summary.codeHealth, null);
  assert.equal(unknown.summary.cognitiveDebt, 1);
  writeFileSync(
    join(root, ".keepup/config.json"),
    JSON.stringify({ exclude: [], include: ["none/**"], testCommand: null })
  );
  const empty = run(root, "status", "--json");
  assert.deepEqual(empty.files, []);
  assert.equal(empty.summary.cognitiveDebt, null);
  assert.equal(empty.summary.codeHealth, null);
  assert.equal(empty.summary.coverage.dark, 0);
});

test("copied skill runs TypeScript and the bundled scorer inside a CommonJS project without dependencies", (t) => {
  const root = scoringFixture(t);
  writeFileSync(join(root, "package.json"), '{"type":"commonjs"}');
  const installed = join(root, "installed skill");
  cpSync(fileURLToPath(new URL("../", import.meta.url)), installed, {
    recursive: true,
  });
  const installedCli = join(installed, "scripts/keepup.mjs");
  command(root, process.execPath, [installedCli, "init"]);
  assert.ok(lstatSync(join(root, ".keepup/scorers/complexity")).mode & 0o111);
  assert.equal(
    lstatSync(join(root, ".keepup/scorers/complexity.mts")).mode & 0o111,
    0
  );
  const bin = join(root, "tools");
  mkdirSync(bin);
  const uvx = join(bin, "uvx");
  writeFileSync(
    uvx,
    `#!/usr/bin/env node
const files = process.argv.slice(6);
for (const file of files) {
  console.log('2,2,10,1,2,location,' + file + ',simple,simple(),1,2');
  console.log('2,10,10,1,2,location,' + file + ',"branch, worst","branch, worst()",2,3');
}
`
  );
  chmodSync(uvx, 0o755);

  const result = spawnSync(
    process.execPath,
    [installedCli, "status", "--json"],
    {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const status: Status = JSON.parse(result.stdout);
  assert.deepEqual(status.warnings, []);
  assert.equal(status.files[0]?.codeScore, 0.5);
  assert.deepEqual(status.files[0]?.metrics.complexity, {
    fn: "branch, worst",
    line: 2,
    raw: 10,
    value: 0.5,
  });
});

function log(root: string, event: unknown) {
  return run(root, "log", JSON.stringify(event));
}

function answer(file: string, correct: boolean) {
  return {
    answer: "left",
    concept: "branch",
    correct,
    file,
    question: "Which branch?",
  };
}

test("evidence retries, individual answer windows and exact drift preserve learner isolation", (t) => {
  const root = scoringFixture(t);
  scorer(
    root,
    "fixed",
    `console.log(JSON.stringify({file:'large.py',metric:'complexity',value:1}));`
  );

  const shown = {
    depth: "walkthrough",
    files: ["large.py"],
    id: "shown-1",
    type: "shown",
  };

  const first = log(root, shown);
  assert.deepEqual(log(root, shown), first);

  let file = run(root, "status", "--json").files.find(
    (f) => f.file === "large.py"
  );

  assert.equal(file?.state, "exposed");
  assert.equal(file?.mind, 0.3);
  assert.equal(file?.drift, 0);
  log(root, {
    answers: Array.from({ length: 9 }, () => answer("large.py", true)),
    files: ["large.py"],
    id: "pre",
    phase: "pre",
    type: "quiz",
  });
  log(root, {
    answers: Array.from({ length: 3 }, () => answer("large.py", false)),
    files: ["large.py"],
    id: "post",
    phase: "post",
    type: "quiz",
  });
  file = run(root, "status", "--json").files.find((f) => f.file === "large.py");
  assert.equal(file?.accuracy, 14 / 17);
  assert.equal(file?.mind, 0.6);
  assert.equal(file?.state, "exposed");
  writeFileSync(join(root, "large.py"), "a\nB\nc\nd\n");
  file = run(root, "status", "--json").files.find((f) => f.file === "large.py");
  assert.equal(file?.drift, 0.5);
  assert.equal(file?.mind, 0.3);
  assert.deepEqual(log(root, shown), first);
  command(root, "git", ["config", "user.email", "other@example.com"]);
  file = run(root, "status", "--json").files.find((f) => f.file === "large.py");
  assert.equal(file?.state, "dark");
  assert.equal(file?.accuracy, null);
});

test("protected metadata, conflicting retries and corrupt logs never partially append", (t) => {
  const root = scoringFixture(t);
  const shown = { depth: "line", files: ["large.py"], id: "a", type: "shown" };
  log(root, shown);
  const path = join(root, ".keepup/events.jsonl");
  const original = readFileSync(path, "utf-8");

  for (const bad of [
    null,
    [],
    42,
    { ...shown, depth: "paragraph" },
    { ...shown, id: "b", who: "forged" },
    { ...shown, files: ["../escape"], id: "c" },
  ]) {
    assert.notEqual(
      spawnSync(process.execPath, [cli, "log", JSON.stringify(bad)], {
        cwd: root,
      }).status,
      0
    );
    assert.equal(readFileSync(path, "utf-8"), original);
  }

  writeFileSync(path, `${original}{"incomplete":true}`);
  assert.notEqual(
    spawnSync(
      process.execPath,
      [cli, "log", JSON.stringify({ ...shown, id: "new" })],
      { cwd: root }
    ).status,
    0
  );
  assert.equal(readFileSync(path, "utf-8"), `${original}{"incomplete":true}`);
});

test("kata numbering and retries serialize; practice snapshots final content and falls back after drift", async (t) => {
  const root = scoringFixture(t);
  scorer(
    root,
    "fixed",
    `console.log(JSON.stringify({file:'large.py',metric:'complexity',value:0.2}));`
  );
  command(root, "git", ["commit", "-qm", "fixture"]);

  const start = (id: string) => ({
    files: ["large.py"],
    id,
    module: "example",
    target: { file: "large.py", goal: 0.8, metric: "complexity" },
    technique: "extract",
    type: "kata_start",
  });

  const invoke = (event: unknown) =>
    // oxlint-disable-next-line promise/avoid-new -- Adapt child-process events while retaining concurrent CLI writer coverage.
    new Promise<StoredEvent>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [cli, "log", JSON.stringify(event)],
        { cwd: root }
      );

      let error = "";
      let output = "";

      child.stdout.on("data", (bytes) => (output += bytes));
      child.stderr.on("data", (bytes) => (error += bytes));
      child.on("error", reject);
      child.on("close", (code) =>
        code ? reject(new Error(error)) : resolve(JSON.parse(output))
      );
    });

  const [one, two] = await Promise.all([
    invoke(start("one")),
    invoke(start("two")),
  ]);

  assert.deepEqual([one.kataNumber, two.kataNumber].toSorted(), [1, 2]);
  assert.deepEqual(
    await Promise.all([invoke(start("one")), invoke(start("two"))]),
    [one, two]
  );
  assert.ok(one.baseline?.contentHashes["small.ts"]);
  assert.deepEqual(
    one.baseline?.definitionHashes,
    Object.fromEntries(
      ["config.json", "scorers/fixed"].map((file) => [
        file,
        createHash("sha256")
          .update(readFileSync(join(root, ".keepup", file)))
          .digest("hex"),
      ])
    )
  );
  writeFileSync(join(root, "large.py"), "A\nb\nc\nd\n");
  log(root, {
    checks: { tests: true },
    files: ["large.py"],
    id: "passed",
    kataNumber: one.kataNumber,
    result: "pass",
    type: "kata_submit",
  });
  const status = run(root, "status", "--json");
  assert.equal(
    status.katas.find((k) => k.kataNumber === one.kataNumber)?.active,
    false
  );
  let file = status.files.find((item) => item.file === "large.py");
  assert.equal(file?.state, "practised");
  assert.equal(file?.drift, 0);
  assert.equal(file?.mind, 0.4);
  writeFileSync(join(root, "large.py"), "A\nB\nC\nd\n");
  file = run(root, "status", "--json").files.find(
    (item) => item.file === "large.py"
  );
  assert.equal(file?.state, "exposed");
  assert.equal(file?.drift, 1);
  assert.equal(file?.mind, 0);
});

function timed(root: string, time: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, KEEPUP_NOW: time },
  });

  return result;
}

test("delayed checks require 24 hours, verify actual answers and recur after seven days below 70%", (t) => {
  const root = scoringFixture(t);
  scorer(
    root,
    "fixed",
    `console.log(JSON.stringify({file:'large.py',metric:'complexity',value:1}));`
  );

  const event = {
    answers: [answer("large.py", false)],
    files: ["large.py"],
    id: "pre",
    phase: "pre",
    type: "quiz",
  };

  assert.equal(
    timed(root, "2026-10-16T12:00:00Z", "log", JSON.stringify(event)).status,
    0
  );

  // SAFETY: timed() asserts CLI success, and the status command emits Status JSON.
  const statusAt = (time: string) =>
    (
      JSON.parse(timed(root, time, "status", "--json").stdout) as Status
    ).files.find((f) => f.file === "large.py");

  assert.equal(statusAt("2026-10-17T11:59:59.999Z")?.due, false);
  assert.equal(statusAt("2026-10-17T12:00:00Z")?.due, true);

  const check = {
    ...event,
    answers: [answer("large.py", true)],
    id: "check",
    phase: "check",
  };

  const original = readFileSync(join(root, ".keepup/events.jsonl"), "utf-8");
  assert.notEqual(
    timed(root, "2026-10-17T11:59:59.999Z", "log", JSON.stringify(check))
      .status,
    0
  );
  assert.equal(
    readFileSync(join(root, ".keepup/events.jsonl"), "utf-8"),
    original
  );
  assert.equal(
    timed(root, "2026-10-17T12:00:00Z", "log", JSON.stringify(check)).status,
    0
  );
  let file = statusAt("2026-10-17T12:00:00Z");
  assert.equal(file?.state, "verified");
  assert.equal(file?.accuracy, 0.5);
  assert.equal(file?.mind, 0.5);
  assert.equal(file?.due, false);
  assert.equal(statusAt("2026-10-24T11:59:59.999Z")?.due, false);
  assert.equal(statusAt("2026-10-24T12:00:00Z")?.due, true);
  const fresh = { ...event, answers: [answer("large.py", false)], id: "fresh" };
  assert.equal(
    timed(root, "2026-10-24T12:00:00Z", "log", JSON.stringify(fresh)).status,
    0
  );
  assert.equal(
    statusAt("2026-10-24T12:00:00Z")?.due,
    true,
    "fresh quiz must not hide overdue weak verification"
  );
  const wrong = { ...check, answers: [answer("large.py", false)], id: "wrong" };
  assert.equal(
    timed(root, "2026-10-24T12:00:00Z", "log", JSON.stringify(wrong)).status,
    0
  );
  file = statusAt("2026-10-24T12:00:00Z");
  assert.equal(file?.state, "verified");
  assert.equal(file?.accuracy, 1 / 4);
  assert.equal(file?.due, false);
  command(root, "git", ["config", "user.email", "other@example.com"]);
  file = statusAt("2026-11-01T12:00:00Z");
  assert.equal(file?.state, "dark");
  assert.equal(file?.due, false);
});

test("map embeds the same status safely, records one history entry and reports browser-open failure", (t) => {
  const root = scoringFixture(t);
  scorer(
    root,
    "fixed",
    `console.log(JSON.stringify({file:'small.ts',metric:'complexity',value:0.5,raw:10}));`
  );
  run(
    root,
    "log",
    JSON.stringify({
      files: ["small.ts"],
      id: "explain-map",
      text: "</script><script>globalThis.attacked=true</script>",
      type: "explain",
    })
  );
  const expected = run(root, "status", "--json");

  const before = readFileSync(join(root, ".keepup/history.jsonl"), "utf-8")
    .trim()
    .split("\n").length;

  const bin = join(root, "bin");
  mkdirSync(bin);

  for (const name of ["open", "xdg-open"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 1\n");
    chmodSync(join(bin, name), 0o755);
  }

  const result = spawnSync(process.execPath, [cli, "map"], {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });

  assert.equal(result.status, 0, result.stderr);
  const output: CommandResults["map"] = JSON.parse(result.stdout);
  assert.equal(output.opened, false);
  assert.ok(output.warnings.some((warning) => warning.includes("Open")));
  const html = readFileSync(output.path, "utf-8");

  const data = JSON.parse(
    html.match(
      /<script id="status-data" type="application\/json">(?<status>[\s\S]*?)<\/script>/u
    )?.groups?.status ?? ""
  );

  assert.deepEqual(data.files, expected.files);
  assert.deepEqual(data.summary, expected.summary);
  assert.equal(html.includes("</script><script>globalThis.attacked"), false);
  assert.ok(
    html.includes("https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js")
  );
  assert.equal(
    readFileSync(join(root, ".keepup/history.jsonl"), "utf-8")
      .trim()
      .split("\n").length,
    before + 1
  );
});

test("in-play finds intervening committed paths, staged and unstaged changes for the current learner", (t) => {
  const root = fixture(t);

  for (const file of ["committed.ts", "staged.ts", "working.ts", "quiet.ts"]) {
    writeFileSync(join(root, file), "original\n");
  }

  command(root, "git", ["add", "."]);
  command(root, "git", ["commit", "-qm", "initial"]);
  run(root, "init");
  run(
    root,
    "log",
    JSON.stringify({
      files: ["committed.ts"],
      id: "learner-start",
      response: "skip",
      type: "response",
    })
  );
  writeFileSync(join(root, "committed.ts"), "changed\n");
  command(root, "git", ["add", "committed.ts"]);
  command(root, "git", ["commit", "-qm", "change"]);
  writeFileSync(join(root, "committed.ts"), "original\n");
  command(root, "git", ["add", "committed.ts"]);
  command(root, "git", ["commit", "-qm", "revert content"]);
  command(root, "git", ["config", "user.email", "other@example.com"]);
  run(
    root,
    "log",
    JSON.stringify({
      files: ["quiet.ts"],
      id: "other-start",
      response: "skip",
      type: "response",
    })
  );
  command(root, "git", ["config", "user.email", "learner@example.com"]);
  writeFileSync(join(root, "staged.ts"), "staged\n");
  command(root, "git", ["add", "staged.ts"]);
  writeFileSync(join(root, "working.ts"), "working\n");
  const before = readFileSync(join(root, ".keepup/events.jsonl"), "utf-8");
  assert.deepEqual(run(root, "in-play"), {
    files: ["committed.ts", "staged.ts", "working.ts"],
    warnings: [],
  });
  assert.equal(
    readFileSync(join(root, ".keepup/events.jsonl"), "utf-8"),
    before
  );
  run(
    root,
    "log",
    JSON.stringify({
      files: ["quiet.ts"],
      id: "current-start",
      response: "skip",
      type: "response",
    })
  );
  assert.deepEqual(run(root, "in-play").files, ["staged.ts", "working.ts"]);
});

test("in-play gives explicit fallbacks and filters renamed or deleted files through current scope", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "old name.ts"), "original\n");
  writeFileSync(join(root, "quiet.ts"), "quiet\n");
  command(root, "git", ["add", "."]);
  run(root, "init");
  const unborn = run(root, "in-play");
  assert.deepEqual(unborn.files, ["old name.ts", "quiet.ts"]);
  assert.ok(unborn.warnings[0]?.includes("No commits yet"));
  command(root, "git", ["commit", "-qm", "initial"]);
  const first = run(root, "in-play");
  assert.deepEqual(first.files, ["old name.ts", "quiet.ts"]);
  assert.ok(first.warnings[0]?.includes("No prior learner event"));
  run(
    root,
    "log",
    JSON.stringify({
      files: ["quiet.ts"],
      id: "before-rewrite",
      response: "skip",
      type: "response",
    })
  );
  command(root, "git", ["checkout", "--orphan", "rewritten"]);
  command(root, "git", ["commit", "-qm", "new root"]);
  command(root, "git", ["mv", "old name.ts", "new -> name.ts"]);
  command(root, "git", ["rm", "quiet.ts"]);
  const rewritten = run(root, "in-play");
  assert.deepEqual(rewritten.files, ["new -> name.ts"]);
  assert.ok(rewritten.warnings[0]?.includes("no reachable historical commit"));
  const configPath = join(root, ".keepup/config.json");
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  writeFileSync(configPath, JSON.stringify({ ...config, exclude: ["new*"] }));
  assert.deepEqual(run(root, "in-play").files, []);
});

test("root filenames matching Object properties remain valid learning targets", (t) => {
  const root = scoringFixture(t);
  const names = ["__proto__", "constructor", "toString"];

  for (const name of names) {
    writeFileSync(join(root, name), "first\nsecond\n");
  }

  command(root, "git", ["add", "--", ...names]);
  log(root, {
    depth: "paragraph",
    files: names,
    id: "shown-special",
    type: "shown",
  });
  log(root, {
    files: names,
    id: "response-special",
    response: "got-it",
    type: "response",
  });
  log(root, {
    files: names,
    id: "explain-special",
    text: "These files contain two lines.",
    type: "explain",
  });
  const status = run(root, "status", "--json");

  for (const name of names) {
    const file = status.files.find((item) => item.file === name);
    assert.equal(file?.state, "exposed");
    assert.equal(file?.drift, 0);
    assert.equal(file?.mind, 0.3);
  }
});

test("kata start rejects changes made during scoring without recording a mixed baseline", (t) => {
  for (const mutation of ["content", "config", "scorer", "scorer-source"]) {
    const root = scoringFixture(t);

    if (mutation === "scorer-source") {
      writeFileSync(
        join(root, ".keepup/scorers/complexity.mts"),
        "// source\n"
      );
    }

    command(root, "git", ["commit", "-qm", "fixture"]);

    let mutate = `writeFileSync(process.argv[1],readFileSync(process.argv[1],'utf8')+'\\n');`;

    switch (mutation) {
      case "content": {
        mutate = `writeFileSync('large.py','changed\\n');`;
        break;
      }

      case "config": {
        mutate = `const path=process.env.KEEPUP_STATE+'/config.json'; writeFileSync(path,readFileSync(path,'utf8')+'\\n');`;
        break;
      }

      case "scorer-source": {
        mutate = `writeFileSync(process.env.KEEPUP_STATE+'/scorers/complexity.mts','// changed\\n');`;
        break;
      }

      default: {
        break;
      }
    }

    scorer(
      root,
      "mutating",
      `const {writeFileSync,readFileSync}=require('node:fs'); console.log(JSON.stringify({file:'large.py',metric:'complexity',value:0.2})); ${mutate}`
    );

    const event = {
      files: ["large.py"],
      id: `start-${mutation}`,
      module: "example",
      target: { file: "large.py", goal: 0.8, metric: "complexity" },
      technique: "extract",
      type: "kata_start",
    };

    const result = spawnSync(
      process.execPath,
      [cli, "log", JSON.stringify(event)],
      { cwd: root, encoding: "utf-8" }
    );

    assert.notEqual(result.status, 0, `${mutation} mutation must reject start`);
    assert.match(result.stderr, /changed during kata setup/u);
    assert.equal(readFileSync(join(root, ".keepup/events.jsonl"), "utf-8"), "");
  }
});
