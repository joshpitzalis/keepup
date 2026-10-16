/* oxlint-disable anti-slop/no-runtime-typeof -- Receipt JSON is an untrusted cache boundary. */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  analyserTool,
  analyserToolChanged,
} from "../keepup/scripts/architecture/analyser.ts";
import { object } from "../keepup/scripts/architecture/parse-common.ts";

interface SourceFile {
  readonly path: string;
  readonly hash: string | null;
  readonly mode: number;
}

interface CheckResult {
  readonly command: string;
  readonly durationMs: number;
}

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf-8" });

  if (result.status !== 0) {
    throw new Error(result.stderr || "Cannot inspect verification source");
  }

  return result.stdout.trimEnd();
}

function sourceFiles(root: string): SourceFile[] {
  const tracked = git(root, "ls-files", "-z").split("\0");

  const untracked = git(
    root,
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "keepup",
    "tests",
    "scripts",
    "tools",
    "docs",
    "agent-skills",
    ".github",
    "AGENTS.md",
    "lefthook.yml",
    "pnpm-workspace.yaml",
    ".node-version"
  ).split("\0");

  return [...new Set([...tracked, ...untracked])]
    .filter(
      (path) =>
        path &&
        !/^(?:\.keepup|\.cogdebt|\.verification|node_modules)\//u.test(path)
    )
    .toSorted()
    .map((path) => {
      const file = join(root, path);

      if (!existsSync(file)) {
        return { hash: null, mode: 0, path };
      }

      if (!lstatSync(file).isFile()) {
        throw new Error(`Verification requires regular source files: ${path}`);
      }

      return {
        hash: digest(readFileSync(file)),
        mode: lstatSync(file).mode & 0o777,
        path,
      };
    });
}

function tapCount(output: string, label: string): number {
  const values = [...output.matchAll(new RegExp(`^# ${label} (\\d+)$`, "gmu"))];
  const value = values[0]?.[1];

  if (values.length !== 1 || value === undefined) {
    throw new Error("Missing complete Node TAP summary");
  }

  return Number(value);
}

function runCheck(root: string, script: string): CheckResult {
  console.log(`Running pnpm ${script} against frozen inputs`);
  const started = Date.now();

  const result = spawnSync("pnpm", ["run", script], {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 20 * 60_000,
  });

  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `pnpm ${script} failed: ${result.error?.message ?? result.signal ?? result.status}`
    );
  }

  if (script === "test") {
    const tests = tapCount(result.stdout, "tests");

    if (
      tests < 1 ||
      tapCount(result.stdout, "pass") !== tests ||
      ["fail", "cancelled", "skipped", "todo"].some(
        (label) => tapCount(result.stdout, label) !== 0
      )
    ) {
      throw new Error(
        "Node suite must be complete, with no failed, skipped, cancelled or pending checks"
      );
    }
  }

  return { command: `pnpm ${script}`, durationMs: Date.now() - started };
}

function reuseReceipt(
  path: string,
  key: string,
  commands: readonly string[]
): boolean {
  if (!existsSync(path)) {
    return false;
  }

  try {
    const receipt = object(JSON.parse(readFileSync(path, "utf-8")));

    return (
      receipt.version === 1 &&
      receipt.key === key &&
      receipt.passed === true &&
      JSON.stringify(receipt.commands) === JSON.stringify(commands) &&
      Array.isArray(receipt.checks) &&
      receipt.checks.length === commands.length &&
      receipt.checks.every((check, index) => {
        const result = object(check);

        return (
          result.command === `pnpm ${commands[index]}` &&
          typeof result.durationMs === "number" &&
          Number.isFinite(result.durationMs) &&
          result.durationMs >= 0
        );
      })
    );
  } catch {
    // A corrupt cache is replaced only after a fresh successful run.
    return false;
  }
}

function verify(): void {
  const args = process.argv.slice(2);

  if (args.some((arg) => !["--browser", "--reuse"].includes(arg))) {
    throw new Error("Usage: verify.ts [--browser] [--reuse]");
  }

  const directory = process.env.KEEPUP_TEST_ANALYSER_DIRECTORY;

  if (!directory) {
    throw new Error(
      "Set KEEPUP_TEST_ANALYSER_DIRECTORY to the pinned analyser installation; full verification cannot skip analyser checks"
    );
  }

  const tool = analyserTool(directory);

  for (const file of [
    "dependency-cruiser/bin/dependency-cruiser.mjs",
    "typescript/lib/typescript.js",
  ]) {
    if (!existsSync(join(tool.directory, "node_modules", file))) {
      throw new Error(`Missing analyser runtime: ${file}`);
    }
  }

  const root = resolve(process.cwd());
  const manifest = sourceFiles(root);
  const profile = args.includes("--browser") ? "full" : "node";

  const environment = Object.entries(process.env)
    .filter(
      ([key]) =>
        ![
          "_",
          "PWD",
          "SHLVL",
          "NODE_TEST_CONTEXT",
          "npm_lifecycle_event",
          "npm_lifecycle_script",
        ].includes(key)
    )
    .toSorted(([a], [b]) => a.localeCompare(b));

  const inputs = {
    analyser: { fingerprint: tool.fingerprint, version: tool.version },
    architecture: process.arch,
    environmentHash: digest(JSON.stringify(environment)),
    manifest,
    platform: process.platform,
    profile,
    revision: git(root, "rev-parse", "HEAD"),
    runtime: process.version,
  };

  const key = digest(JSON.stringify(inputs));
  const receipts = join(root, ".verification", "receipts");
  const receiptPath = join(receipts, `${key}.json`);

  const commands = [
    "check",
    "typecheck",
    "test",
    ...(profile === "full" ? ["test:browser"] : []),
  ];

  if (
    args.includes("--reuse") &&
    !process.env.CI &&
    reuseReceipt(receiptPath, key, commands)
  ) {
    console.log(`Reusing passed receipt ${receiptPath}; no checks executed`);

    return;
  }

  const snapshot = mkdtempSync(join(tmpdir(), "keepup-frozen-"));
  const artifacts = join(root, ".verification", "artifacts", randomUUID());

  try {
    for (const file of manifest) {
      if (file.hash === null) {
        continue;
      }

      const target = join(snapshot, file.path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(root, file.path), target);

      if (digest(readFileSync(target)) !== file.hash) {
        throw new Error(
          "Source changed during snapshot capture; retry after edits settle"
        );
      }

      chmodSync(target, file.mode);
    }

    if (
      JSON.stringify(sourceFiles(root)) !== JSON.stringify(manifest) ||
      git(root, "rev-parse", "HEAD") !== inputs.revision
    ) {
      throw new Error(
        "Source inventory changed during snapshot capture; retry after edits settle"
      );
    }

    if (existsSync(join(root, "node_modules"))) {
      symlinkSync(
        join(root, "node_modules"),
        join(snapshot, "node_modules"),
        "dir"
      );
    }

    const checks = commands.map((command) => runCheck(snapshot, command));

    if (
      manifest.some(
        (file) =>
          file.hash !== null &&
          (!existsSync(join(snapshot, file.path)) ||
            digest(readFileSync(join(snapshot, file.path))) !== file.hash ||
            (lstatSync(join(snapshot, file.path)).mode & 0o777) !== file.mode)
      )
    ) {
      throw new Error("Frozen source changed during checks; no receipt issued");
    }

    if (analyserToolChanged(tool)) {
      throw new Error(
        "Analyser changed during verification; no receipt issued"
      );
    }

    mkdirSync(receipts, { recursive: true });
    const temporary = join(receipts, `${randomUUID()}.tmp`);
    writeFileSync(
      temporary,
      `${JSON.stringify({ checks, commands, completedAt: new Date().toISOString(), inputs, key, passed: true, version: 1 }, null, 2)}\n`
    );
    renameSync(temporary, receiptPath);
    console.log(`Passed ${profile} verification. Receipt: ${receiptPath}`);
  } finally {
    for (const name of ["test-results", "playwright-report"]) {
      if (existsSync(join(snapshot, name))) {
        mkdirSync(artifacts, { recursive: true });
        cpSync(join(snapshot, name), join(artifacts, name), {
          recursive: true,
        });
      }
    }

    rmSync(snapshot, { force: true, recursive: true });
  }
}

try {
  verify();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Verification failed");
  process.exitCode = 1;
}
