#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { BinaryLike } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  chmodSync,
  realpathSync,
  lstatSync,
  appendFileSync,
  openSync,
  closeSync,
  unlinkSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  dirname,
  join,
  resolve,
  relative,
  matchesGlob,
  isAbsolute,
} from "node:path";
import { fileURLToPath } from "node:url";

import { architectureCommand } from "./architecture/commands.ts";
import {
  hasOpenArchitectureExercise,
  readExerciseAcceptance,
} from "./architecture/exercise-storage.ts";
import {
  acceptedPracticeEvidence,
  assertAttemptStable,
} from "./architecture/exercise-submit.ts";
import { strings } from "./architecture/parse-common.ts";
import { codeHealth } from "./code-health.ts";
import { parseEvent } from "./handlers/parse-event.ts";
import type { EventType, EventWithArchitecturePass } from "./handlers/types.ts";

interface Metric {
  value: number;
  raw?: number;
  line?: number;
  fn?: string;
}

interface Summary {
  cognitiveDebt: number | null;
  codeHealth: number | null;
  scoredLineCoverage: number | null;
  coverage: Record<string, number>;
  due: number;
}

type StoredInput<E = EventWithArchitecturePass<EventType>> = E extends {
  type: string;
}
  ? Omit<E, "files" | "kataNumber"> & { files: readonly string[] }
  : never;

export type StoredEvent = StoredInput & {
  t: string;
  who: string;
  sha: string | null;
  snapshots: Record<string, string>;
  retryDigest: string;
  kataNumber?: number;
  baseline?: {
    files: FileStatus[];
    summary: Summary;
    metrics: string[];
    warnings: string[];
    contentHashes: Record<string, string>;
    definitionHashes: Record<string, string>;
  };
};

type FileStatus = {
  file: string;
  lines: number;
  metrics: Record<string, Metric>;
  codeScore: number | null;
  debt: number;
  weight: number;
} & ReturnType<typeof learningState>;

export interface Status {
  who: string;
  files: FileStatus[];
  metrics: string[];
  summary: Summary;
  delta: Summary | null;
  warnings: string[];
  katas: ReturnType<typeof kataContexts>;
}

export interface CommandResults {
  init: ReturnType<typeof initialize>;
  health: ReturnType<typeof codeHealth>;
  log: StoredEvent;
  status: Status;
  "in-play": ReturnType<typeof inPlay>;
  map: ReturnType<typeof map>;
}

function git(...args: string[]) {
  const result = spawnSync("git", args, { encoding: "utf-8" });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Git command failed");
  }

  return result.stdout;
}

let root: string;
let state: string;

/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters -- This is the configuration JSON parser; it rejects invalid glob and command values. */
function readConfig(): {
  testCommand: string | null;
  include: string[];
  exclude: string[];
} {
  const config = JSON.parse(readFileSync(join(state, "config.json"), "utf-8"));

  if (
    !config ||
    !Array.isArray(config.include) ||
    !Array.isArray(config.exclude) ||
    ![...config.include, ...config.exclude].every(
      (glob: unknown) => typeof glob === "string"
    ) ||
    !(
      config.testCommand === null ||
      (typeof config.testCommand === "string" && config.testCommand.trim())
    )
  ) {
    throw new Error(
      `Invalid ${join(state, "config.json")}: expected testCommand (string or null) and include/exclude glob arrays`
    );
  }

  return config;
}

/* oxlint-enable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters */

function scopedFiles(config = readConfig()) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim());
  }

  return result.stdout.split("\0").filter((file) => {
    if (
      !file ||
      [".keepup", ".cogdebt", ".git"].some(
        (directory) => file === directory || file.startsWith(`${directory}/`)
      )
    ) {
      return false;
    }

    if (
      !config.include.some((glob) => matchesGlob(file, glob)) ||
      config.exclude.some((glob) => matchesGlob(file, glob))
    ) {
      return false;
    }

    const path = join(root, file);

    if (!existsSync(path) || !lstatSync(path).isFile()) {
      return false;
    }

    const location = relative(root, realpathSync(path));

    return !location.startsWith("..") && !isAbsolute(location);
  });
}

function createIfMissing(path: string, content: string | Uint8Array) {
  try {
    writeFileSync(path, content, { flag: "wx" });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EEXIST"
    ) {
      throw error;
    }
  }
}

/* oxlint-disable anti-slop/no-runtime-typeof -- The package manifest is external JSON and must be checked before selecting a command. */
function inferTestCommand() {
  const manifest = join(root, "package.json");

  if (!existsSync(manifest)) {
    return null;
  }

  const pkg = JSON.parse(readFileSync(manifest, "utf-8"));

  if (!pkg.scripts?.test || /no test specified/iu.test(pkg.scripts.test)) {
    return null;
  }

  const manager =
    typeof pkg.packageManager === "string"
      ? pkg.packageManager.split("@")[0]
      : null;

  if (manager === "pnpm" || existsSync(join(root, "pnpm-lock.yaml"))) {
    return "pnpm test";
  }

  if (manager === "yarn" || existsSync(join(root, "yarn.lock"))) {
    return "yarn test";
  }

  if (
    manager === "bun" ||
    existsSync(join(root, "bun.lock")) ||
    existsSync(join(root, "bun.lockb"))
  ) {
    return "bun run test";
  }

  return "npm test";
}

/* oxlint-enable anti-slop/no-runtime-typeof */

function initialize() {
  mkdirSync(join(state, "scorers"), { recursive: true });
  mkdirSync(join(state, "snapshots"), { recursive: true });
  createIfMissing(
    join(state, "config.json"),
    `${JSON.stringify(
      {
        exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
        include: ["**/*"],
        testCommand: inferTestCommand(),
      },
      null,
      2
    )}\n`
  );
  const missionPath = join(state, "MISSION.md");

  const emptyMission =
    "# Mission\n\n## Why\n\n## Success\n\n## Constraints\n\n## Exclusions\n";

  const missionExists = existsSync(missionPath);

  if (
    !missionExists ||
    (lstatSync(missionPath).isFile() &&
      readFileSync(missionPath, "utf-8") === emptyMission)
  ) {
    const reviewAfter = new Date(
      Date.parse(now()) + 7 * 86_400_000
    ).toISOString();

    writeFileSync(
      missionPath,
      `# Mission

## Why
Understand this codebase well enough to make informed product decisions, give useful feedback on agents' work, and keep that work aligned with my goals.

## Success
- Have a clear mental model of consequential changes.
- Recognise which decisions deserve my attention.
- Spot gaps between intended and actual behaviour before they become surprises.

## How I'll learn
Learn alongside ongoing work, without a fixed time commitment. Combine explanations and recall with hands-on code exploration and refactoring.

## Out of scope
Nothing excluded yet.

<!-- keepup-starter-review-after: ${reviewAfter} -->
`,
      { flag: missionExists ? "w" : "wx" }
    );
  }

  createIfMissing(join(state, "events.jsonl"), "");
  createIfMissing(join(state, "history.jsonl"), "");
  const bundledScorers = fileURLToPath(new URL("../scorers/", import.meta.url));

  if (existsSync(bundledScorers)) {
    for (const name of readdirSync(bundledScorers)) {
      const destination = join(state, "scorers", name);

      if (existsSync(destination)) {
        continue;
      }

      copyFileSync(join(bundledScorers, name), destination);
      chmodSync(
        destination,
        lstatSync(join(bundledScorers, name)).mode & 0o777
      );
    }
  }

  const ignorePath = join(root, ".gitignore");

  const ignore = existsSync(ignorePath)
    ? readFileSync(ignorePath, "utf-8")
    : "";

  const mapPath = `${relative(root, state)}/map.html`;

  if (!ignore.split(/\r?\n/u).includes(mapPath)) {
    writeFileSync(
      ignorePath,
      `${ignore + (ignore && !ignore.endsWith("\n") ? "\n" : "") + mapPath}\n`
    );
  }

  return { config: readConfig(), files: scopedFiles(), root, state };
}

const EXPOSURE_MIND = 0.3;
const QUIZ_CAP = 0.6;
const PRACTICE_BONUS = 0.1;

function now() {
  return new Date(
    process.env.KEEPUP_NOW || process.env.COGDEBT_NOW || Date.now()
  ).toISOString();
}

function learner() {
  const who = git("config", "user.email").trim();

  if (!who) {
    throw new Error("Set git user.email to identify the learner");
  }

  return who;
}

function withLock<T>(action: () => T): T {
  const path = join(state, "write.lock");
  const deadline = Date.now() + 5000;
  let lock;

  while (lock === undefined) {
    try {
      lock = openSync(path, "wx");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "EEXIST"
      ) {
        throw error;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          "Learning state is busy; retry after the other writer finishes",
          { cause: error }
        );
      }

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }

  try {
    return action();
  } finally {
    closeSync(lock);
    unlinkSync(path);
  }
}

function readLog(name: string) {
  const content = readFileSync(join(state, name), "utf-8");

  if (content && !content.endsWith("\n")) {
    throw new Error(`Incomplete ${name}; left untouched`);
  }

  return content
    ? content
        .slice(0, -1)
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
}

/* oxlint-disable anti-slop/no-runtime-typeof -- Stored event metadata and snapshot hashes are validated at this read boundary. */
function readEvents(): StoredEvent[] {
  const events = readLog("events.jsonl");

  for (const event of events) {
    if (
      !event ||
      typeof event.who !== "string" ||
      !Number.isFinite(Date.parse(event.t)) ||
      !(event.sha === null || typeof event.sha === "string") ||
      typeof event.retryDigest !== "string" ||
      !event.snapshots ||
      typeof event.snapshots !== "object"
    ) {
      throw new Error("Invalid stored event metadata; log left untouched");
    }

    const input = Object.fromEntries(
      Object.entries(event).filter(
        ([key]) =>
          !["t", "who", "sha", "snapshots", "retryDigest", "baseline"].includes(
            key
          ) && !(event.type === "kata_start" && key === "kataNumber")
      )
    );

    parseEvent(input);

    if (
      digest(JSON.stringify(canonical(input))) !== event.retryDigest ||
      Object.entries(event.snapshots).some(
        ([file, hash]) =>
          !event.files.includes(file) ||
          typeof hash !== "string" ||
          !/^[a-f0-9]{64}$/u.test(hash)
      )
    ) {
      throw new Error("Invalid stored event payload or snapshot");
    }

    if (
      event.type === "kata_start" &&
      (!Number.isInteger(event.kataNumber) ||
        event.kataNumber < 1 ||
        !event.baseline)
    ) {
      throw new Error("Invalid stored kata context");
    }
  }

  return events;
}

/* oxlint-enable anti-slop/no-runtime-typeof */

/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type -- Canonicalization preserves arbitrary JSON values for stable retry digests. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (value && typeof value === "object") {
    // SAFETY: the branch established a non-null object; property values remain unknown.
    const record = value as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(record)
        .toSorted()
        .map((key) => [key, canonical(record[key])])
    );
  }

  return value;
}

/* oxlint-enable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type */

function digest(bytes: BinaryLike) {
  return createHash("sha256").update(bytes).digest("hex");
}

function kataInventory(targets: readonly string[]) {
  const sha = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf-8",
  });

  if (sha.status !== 0) {
    throw new Error("Commit the repository before starting a kata");
  }

  const changed = spawnSync(
    "git",
    ["status", "--porcelain", "-z", "--", ...targets],
    { cwd: root, encoding: "utf-8" }
  );

  if (changed.status !== 0 || changed.stdout) {
    throw new Error(
      "Kata target files must be clean, including staged changes"
    );
  }

  const contentHashes: Record<string, string> = Object.create(null);
  const snapshotBytes = new Map<string, Buffer>();

  for (const file of scopedFiles()) {
    const bytes = readFileSync(join(root, file));
    contentHashes[file] = digest(bytes);

    if (targets.includes(file)) {
      snapshotBytes.set(file, bytes);
    }
  }

  const definitions = [
    "config.json",
    ...readdirSync(join(state, "scorers"))
      .toSorted()
      .filter((name) => {
        const stat = lstatSync(join(state, "scorers", name));

        // The launcher depends on this non-executable TypeScript source.
        return (
          stat.isFile() && (stat.mode & 0o111 || name === "complexity.mts")
        );
      })
      .map((name) => `scorers/${name}`),
  ];

  const definitionHashes: Record<string, string> = Object.create(null);

  for (const file of definitions) {
    definitionHashes[file] = digest(readFileSync(join(state, file)));
  }

  return {
    inventory: { contentHashes, definitionHashes, sha: sha.stdout.trim() },
    snapshotBytes,
  };
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- The CLI JSON input is parsed immediately below.
function logEvent(value: unknown) {
  const input = parseEvent(value);

  if (input.type === "architecture_pass") {
    throw new Error(
      "Architecture practice can only be recorded by accepted internal exercise completion"
    );
  }

  return withLock(() => writeEventLocked(input));
}

// oxlint-disable-next-line complexity -- Preserve the existing atomic write workflow and supported snapshot writer.
function writeEventLocked(
  input: ReturnType<typeof parseEvent>,
  validate?: (event: StoredEvent) => void
) {
  const events = readEvents();
  const who = learner();
  const retryDigest = digest(JSON.stringify(canonical(input)));

  const previous = events.find(
    (event) => event.who === who && event.id === input.id
  );

  if (previous) {
    if (previous.retryDigest !== retryDigest) {
      throw new Error("Retry id already used with different input");
    }

    return previous;
  }

  if (
    input.type === "kata_start" &&
    hasOpenArchitectureExercise(state, null, events)
  ) {
    throw new Error(
      "An architecture exercise context is active in this shared source tree; explicitly abandon or complete it before another kata"
    );
  }

  const scope = scopedFiles();

  if (input.files.some((file) => !scope.includes(file))) {
    throw new Error(
      "Event files must be tracked regular files within configured scope"
    );
  }

  if (
    input.type === "quiz" &&
    input.phase === "check" &&
    !checkState(
      input.files[0],
      events.filter((event) => event.who === who),
      now()
    ).due
  ) {
    throw new Error("No delayed check is due for this file");
  }

  if (input.kataNumber !== undefined) {
    const start = events.find(
      (event) =>
        event.type === "kata_start" &&
        event.who === who &&
        event.kataNumber === input.kataNumber
    );

    if (!start || input.files.some((file) => !start.files.includes(file))) {
      throw new Error("Unknown kata or files outside kata");
    }

    if (
      events.some(
        (event) =>
          event.type === "kata_submit" &&
          event.who === who &&
          event.kataNumber === input.kataNumber &&
          ["pass", "abandon"].includes(event.result)
      )
    ) {
      throw new Error("Kata already closed");
    }
  }

  const sha = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf-8",
  });

  const event: StoredEvent = {
    ...input,
    retryDigest,
    sha: sha.status === 0 ? sha.stdout.trim() : null,
    snapshots: Object.create(null),
    t: now(),
    who,
  };

  let startingBytes;

  if (input.type === "kata_start") {
    const before = kataInventory(input.files);
    startingBytes = before.snapshotBytes;
    event.sha = before.inventory.sha;
    event.kataNumber =
      1 +
      Math.max(
        0,
        ...events
          .filter((stored) => stored.type === "kata_start")
          .map((stored) => stored.kataNumber ?? 0)
      );
    const { files, summary, metrics, warnings } = computeStatus(events);
    let after;

    try {
      after = kataInventory(input.files);
    } catch {
      throw new Error(
        "Repository changed during kata setup; restore clean targets and retry"
      );
    }

    if (
      JSON.stringify(canonical(before.inventory)) !==
      JSON.stringify(canonical(after.inventory))
    ) {
      throw new Error(
        "Repository changed during kata setup; retry against a stable version"
      );
    }

    event.baseline = {
      contentHashes: before.inventory.contentHashes,
      definitionHashes: before.inventory.definitionHashes,
      files,
      metrics,
      summary,
      warnings,
    };

    const baselineTarget = event.baseline.files.find(
      (file) => file.file === input.target.file
    )?.metrics[input.target.metric]?.value;

    if (baselineTarget === undefined || input.target.goal <= baselineTarget) {
      throw new Error("Kata goal must improve an available target metric");
    }
  }

  if (
    ["shown", "quiz", "kata_start"].includes(input.type) ||
    (input.type === "kata_submit" && input.result === "pass") ||
    input.type === "architecture_pass"
  ) {
    for (const file of input.files) {
      const bytes = startingBytes
        ? startingBytes.get(file)
        : readFileSync(join(root, file));

      if (bytes === undefined) {
        throw new Error(`Missing captured snapshot for ${file}`);
      }

      const hash = digest(bytes);
      createIfMissing(join(state, "snapshots", hash), bytes);
      event.snapshots[file] = hash;
    }
  }

  validate?.(event);
  appendFileSync(join(state, "events.jsonl"), `${JSON.stringify(event)}\n`);

  return event;
}

function recordArchitecturePractice(
  exerciseId: string,
  acceptanceId: string
): StoredEvent {
  const evidence = acceptedPracticeEvidence(
    root,
    state,
    exerciseId,
    acceptanceId,
    learner(),
    readEvents()
  );

  const input = parseEvent({
    id: `architecture:${exerciseId}:pass`,
    type: "architecture_pass",
    ...evidence,
  });

  return writeEventLocked(input, (event) => {
    const checked = acceptedPracticeEvidence(
      root,
      state,
      exerciseId,
      acceptanceId,
      learner(),
      readEvents()
    );

    if (JSON.stringify(checked) !== JSON.stringify(evidence)) {
      throw new Error(
        "Accepted evidence changed during supported practice snapshot capture"
      );
    }

    const accepted = readExerciseAcceptance(state, exerciseId, acceptanceId);

    if (
      !accepted ||
      event.who !== accepted.learner ||
      event.sha !== accepted.attempt.inventory.revision ||
      JSON.stringify(Object.keys(event.snapshots).toSorted()) !==
        JSON.stringify([...evidence.files].toSorted())
    ) {
      throw new Error(
        "Practice event must reference its accepted candidate revision"
      );
    }

    for (const file of evidence.files) {
      const hash = digest(readFileSync(join(root, file)));

      if (
        event.snapshots[file] !== hash ||
        accepted.attempt.inventory.manifest.find((entry) => entry.path === file)
          ?.hash !== hash ||
        digest(readFileSync(join(state, "snapshots", hash))) !== hash
      ) {
        throw new Error(
          "Architecture practice snapshot bytes do not match accepted source"
        );
      }
    }

    assertAttemptStable(root, state, accepted.attempt);
  });
}

function driftSince(
  file: string,
  hash: string | undefined,
  warnings: string[]
) {
  if (!hash) {
    return 1;
  }

  if (!/^[a-f0-9]{64}$/u.test(hash)) {
    throw new Error("Invalid stored snapshot reference");
  }

  const snapshot = join(state, "snapshots", hash);

  if (!existsSync(snapshot)) {
    warnings.push(`Missing snapshot for ${file}; drift is full`);

    return 1;
  }

  const before = readFileSync(snapshot);
  const after = readFileSync(join(root, file));

  if (digest(before) !== hash) {
    warnings.push(`Damaged snapshot for ${file}; drift is full`);

    return 1;
  }

  if (before.equals(after)) {
    return 0;
  }

  const lines = lineCount(before.toString("utf-8"));

  if (!lines) {
    return 1;
  }

  const directory = mkdtempSync(join(tmpdir(), "keepup-diff-"));

  try {
    const current = join(directory, "current");
    writeFileSync(current, after);

    const diff = spawnSync(
      "git",
      [
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--numstat",
        "--no-renames",
        "--",
        snapshot,
        current,
      ],
      { cwd: root, encoding: "utf-8" }
    );

    if (diff.error || (diff.status !== 0 && diff.status !== 1)) {
      throw new Error(
        diff.error?.message || diff.stderr || "Cannot measure drift"
      );
    }

    const [added, removed] = diff.stdout.split("\t");

    if (added === "-" || removed === "-") {
      warnings.push(`Binary changes in ${file}; drift is full`);

      return 1;
    }

    return Math.min(1, (Number(added) + Number(removed)) / lines);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

const DAY_MS = 86_400_000;

function answerAccuracy(answers: { correct: boolean; weight: number }[]) {
  const recent = answers.slice(-10);

  return recent.length
    ? recent.reduce(
        (sum, answer) => sum + (answer.correct ? answer.weight : 0),
        0
      ) / recent.reduce((sum, answer) => sum + answer.weight, 0)
    : null;
}

function checkState(file: string, events: StoredEvent[], at: string) {
  let lastQuiz: { t: string; index: number } | null = null;
  let lastCheck: { t: string; index: number } | null = null;
  let verified = false;
  const answers: { correct: boolean; weight: number }[] = [];

  const dueAt = (time: string) => {
    const quizDue =
      lastQuiz !== null &&
      (!lastCheck || lastQuiz.index > lastCheck.index) &&
      Date.parse(time) - Date.parse(lastQuiz.t) >= DAY_MS &&
      time.slice(0, 10) !== lastQuiz.t.slice(0, 10);

    const weakDue =
      verified &&
      lastCheck !== null &&
      (answerAccuracy(answers) ?? 0) < 0.7 &&
      Date.parse(time) - Date.parse(lastCheck.t) >= 7 * DAY_MS;

    return quizDue || weakDue;
  };

  for (const [index, event] of events.entries()) {
    if (event.type !== "quiz") {
      continue;
    }

    const current = event.answers.filter((answer) => answer.file === file);

    if (!current.length) {
      continue;
    }

    if (event.phase === "check") {
      if (dueAt(event.t)) {
        lastCheck = { index, t: event.t };
        verified ||= current.some((answer) => answer.correct);
      }
    } else {
      lastQuiz = { index, t: event.t };
    }

    answers.push(
      ...current.map((answer) => ({
        ...answer,
        weight: event.phase === "post" ? 0.5 : 1,
      }))
    );
  }

  return { due: dueAt(at), verified };
}

function learningState(
  file: string,
  events: StoredEvent[],
  warnings: string[]
) {
  const relevant = events.filter((event) => event.files.includes(file));

  const answers = relevant
    .filter((event) => event.type === "quiz")
    .flatMap((event) =>
      event.answers
        .filter((answer) => answer.file === file)
        .map((answer) => ({
          ...answer,
          weight: event.phase === "post" ? 0.5 : 1,
        }))
    )
    .slice(-10);

  const accuracy = answerAccuracy(answers);
  const check = checkState(file, events, now());

  const evidence = relevant.findLast((event) =>
    Object.hasOwn(event.snapshots, file)
  );

  const exposed = relevant.some((event) =>
    ["shown", "quiz", "kata_start"].includes(event.type)
  );

  const practised = relevant.some(
    (event) =>
      (event.type === "kata_submit" && event.result === "pass") ||
      event.type === "architecture_pass"
  );

  const drift = driftSince(file, evidence?.snapshots[file], warnings);

  let base = exposed ? EXPOSURE_MIND : 0;

  if (accuracy !== null) {
    base = Math.min(QUIZ_CAP, accuracy);
  }

  if (check.verified) {
    base = accuracy ?? 0;
  }

  let learning = exposed ? "exposed" : "dark";

  if (check.verified && drift <= 0.5) {
    learning = "verified";
  }

  if (practised && drift <= 0.5) {
    learning = "practised";
  }

  return {
    accuracy,
    drift,
    due: check.due,
    explain:
      relevant.findLast((event) => event.type === "explain")?.text ?? null,
    lastQuiz: relevant.findLast((event) => event.type === "quiz")?.t ?? null,
    mind: Math.min(1, base + (practised ? PRACTICE_BONUS : 0)) * (1 - drift),
    state: learning,
  };
}

function kataContexts(events: StoredEvent[]) {
  return events.flatMap((start) => {
    if (start.type !== "kata_start") {
      return [];
    }

    const continuation = events.filter(
      (event) => event.kataNumber === start.kataNumber && event !== start
    );

    const submissions = continuation.filter(
      (event) => event.type === "kata_submit"
    );

    return [
      {
        ...start,
        active: !submissions.some((event) =>
          ["pass", "abandon"].includes(event.result)
        ),
        explanations: continuation.filter((event) => event.type === "explain"),
        hints: continuation.filter((event) => event.type === "hint"),
        quizzes: continuation.filter((event) => event.type === "quiz"),
        submissions,
      },
    ];
  });
}

const BASE_WEIGHT = 0.25;
const CODE_WEIGHT = 0.75;

function lineCount(text: string) {
  return text.length
    ? text.split("\n").length - Number(text.endsWith("\n"))
    : 0;
}

/* oxlint-disable anti-slop/no-runtime-typeof -- Scorer JSON is untrusted until this function validates every report. */
// oxlint-disable-next-line complexity -- Scorer validation and partial-failure handling remain together until their dedicated refactor.
function scoreFiles(files: string[], who: string, warnings: string[]) {
  const reports = new Map<string, Record<string, Metric>>(
    files.map((file) => [file, Object.create(null)])
  );

  const directory = join(state, "scorers");

  const scorers = existsSync(directory)
    ? readdirSync(directory)
        .toSorted()
        .filter((name) => {
          const stat = lstatSync(join(directory, name));

          return stat.isFile() && stat.mode & 0o111;
        })
    : [];

  if (!scorers.length) {
    warnings.push("No executable scorers available");
  }

  for (const scorer of scorers) {
    if (!files.length) {
      break;
    }

    const result = spawnSync(join(directory, scorer), [], {
      cwd: root,
      encoding: "utf-8",
      env: {
        ...process.env,
        COGDEBT_LEARNER: who,
        COGDEBT_STATE: state,
        KEEPUP_LEARNER: who,
        KEEPUP_STATE: state,
      },
      input: `${files.join("\n")}\n`,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });

    if (result.error || result.status !== 0) {
      warnings.push(
        `Scorer ${scorer} failed: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`
      );
      continue;
    }

    try {
      const rows = result.stdout
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      const seen = new Set();

      for (const row of rows) {
        if (
          !row ||
          !reports.has(row.file) ||
          typeof row.metric !== "string" ||
          !row.metric.trim() ||
          !Number.isFinite(row.value) ||
          row.value < 0 ||
          row.value > 1 ||
          (row.raw !== undefined && !Number.isFinite(row.raw)) ||
          (row.line !== undefined &&
            (!Number.isInteger(row.line) || row.line < 1)) ||
          (row.fn !== undefined && typeof row.fn !== "string")
        ) {
          throw new Error("invalid report");
        }

        const key = JSON.stringify([row.file, row.metric]);

        if (
          seen.has(key) ||
          Object.hasOwn(reports.get(row.file) ?? {}, row.metric)
        ) {
          throw new Error("duplicate file/metric");
        }

        seen.add(key);
      }

      for (const { file, metric, value, raw, line, fn } of rows) {
        const report: Metric = { value };

        if (raw !== undefined) {
          report.raw = raw;
        }

        if (line !== undefined) {
          report.line = line;
        }

        if (fn !== undefined) {
          report.fn = fn;
        }

        Object.defineProperty(reports.get(file), metric, {
          enumerable: true,
          value: report,
        });
      }

      if (result.stderr.trim()) {
        warnings.push(`Scorer ${scorer}: ${result.stderr.trim()}`);
      }
    } catch (error) {
      warnings.push(
        `Scorer ${scorer} output ignored: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return reports;
}

/* oxlint-enable anti-slop/no-runtime-typeof */

function computeStatus(allEvents = readEvents()): Status {
  const who = learner();
  const events = allEvents.filter((event) => event.who === who);
  const warnings: string[] = [];
  const paths = scopedFiles();
  const reports = scoreFiles(paths, who, warnings);

  const files = paths.map((file) => {
    const metrics = reports.get(file) ?? {};
    const values = Object.values(metrics).map((report) => report.value);

    return {
      codeScore: values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null,
      file,
      lines: lineCount(readFileSync(join(root, file), "utf-8")),
      metrics,
      ...learningState(file, events, warnings),
      debt: 0,
      weight: 0,
    };
  });

  const largest = Math.max(0, ...files.map((file) => file.lines));

  let code = 0;
  let debts = 0;
  let scoredLines = 0;
  let weights = 0;

  const lines = files.reduce((sum, file) => sum + file.lines, 0);

  for (const file of files) {
    file.weight =
      (largest ? file.lines / largest : 0) *
      (BASE_WEIGHT + CODE_WEIGHT * (1 - (file.codeScore ?? 0)));
    file.debt = file.weight * (1 - file.mind);
    weights += file.weight;
    debts += file.debt;

    if (file.codeScore !== null) {
      scoredLines += file.lines;
      code += file.lines * file.codeScore;
    }
  }

  const missing = files.filter((file) => file.codeScore === null).length;

  if (missing) {
    warnings.push(
      `${missing} files have unavailable code scores; debt conservatively uses zero, code health excludes their lines`
    );
  }

  const summary = {
    codeHealth: scoredLines ? code / scoredLines : null,
    cognitiveDebt: weights ? debts / weights : null,
    coverage: Object.fromEntries(
      ["dark", "exposed", "verified", "practised"].map((name) => [
        name,
        lines
          ? files
              .filter((file) => file.state === name)
              .reduce((sum, file) => sum + file.lines, 0) / lines
          : 0,
      ])
    ),
    due: files.filter((file) => file.due).length,
    scoredLineCoverage: lines ? scoredLines / lines : 0,
  };

  return {
    delta: null,
    files,
    katas: kataContexts(events),
    metrics: [
      ...new Set(files.flatMap((file) => Object.keys(file.metrics))),
    ].toSorted(),
    summary,
    warnings,
    who,
  };
}

function status() {
  const result = computeStatus();
  const historyPath = join(state, "history.jsonl");
  const history = readFileSync(historyPath, "utf-8");

  if (history && !history.endsWith("\n")) {
    throw new Error("Incomplete history log; left untouched");
  }

  const previous = history
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .findLast((entry) => entry.who === result.who);

  if (previous) {
    const difference = (a: number | null, b: number | null) =>
      a === null || b === null ? null : a - b;

    result.delta = {
      codeHealth: difference(
        result.summary.codeHealth,
        previous.summary.codeHealth
      ),
      cognitiveDebt: difference(
        result.summary.cognitiveDebt,
        previous.summary.cognitiveDebt
      ),
      coverage: Object.fromEntries(
        Object.keys(result.summary.coverage).map((key) => [
          key,
          (result.summary.coverage[key] ?? 0) - previous.summary.coverage[key],
        ])
      ),
      due: result.summary.due - previous.summary.due,
      scoredLineCoverage: difference(
        result.summary.scoredLineCoverage,
        previous.summary.scoredLineCoverage
      ),
    };
  }

  const t = now();
  appendFileSync(
    historyPath,
    `${JSON.stringify({ summary: result.summary, t, who: result.who })}\n`
  );

  return result;
}

function textStatus(result: Status) {
  const percent = (value: number | null) =>
    value === null ? "unavailable" : `${(value * 100).toFixed(1)}%`;

  const delta = result.delta
    ? `Delta: debt ${percent(result.delta.cognitiveDebt)}, health ${percent(result.delta.codeHealth)}, scored lines ${percent(result.delta.scoredLineCoverage)}, ${Object.entries(
        result.delta.coverage
      )
        .map(([key, value]) => `${key} ${percent(value)}`)
        .join(", ")}, due ${result.delta.due}`
    : "No previous baseline";

  const rows = result.files
    .toSorted((a, b) => b.debt - a.debt || a.file.localeCompare(b.file))
    .slice(0, 10)
    .map((file) => {
      const details = Object.entries(file.metrics)
        .map(
          ([name, report]) =>
            `${name}=${percent(report.value)}${report.raw === undefined ? "" : ` raw=${report.raw}`}${report.fn ? ` ${report.fn}` : ""}${report.line ? `:${report.line}` : ""}`
        )
        .join(", ");

      return `${file.file} | ${file.state} | debt ${file.debt.toFixed(3)} | code ${percent(file.codeScore)}${details ? ` | ${details}` : ""}`;
    });

  return [
    `Cognitive debt: ${percent(result.summary.cognitiveDebt)}`,
    `Code health: ${percent(result.summary.codeHealth)} (scored lines ${percent(result.summary.scoredLineCoverage)})`,
    `Coverage: ${Object.entries(result.summary.coverage)
      .map(([key, value]) => `${key} ${percent(value)}`)
      .join(", ")}`,
    `Due checks: ${result.summary.due}`,
    delta,
    ...rows,
    ...result.warnings.map((warning) => `Warning: ${warning}`),
  ].join("\n");
}

function inPlay() {
  const events = readEvents();
  const who = learner();
  const previous = events.findLast((event) => event.who === who);
  const warnings: string[] = [];

  const paths = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf-8" });

    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || "Cannot inspect Git changes");
    }

    return result.stdout.split("\0").filter(Boolean);
  };

  const changed = new Set([
    ...paths([
      "diff",
      "--name-only",
      "--no-relative",
      "--no-renames",
      "-z",
      "--",
    ]),
    ...paths([
      "diff",
      "--cached",
      "--name-only",
      "--no-relative",
      "--no-renames",
      "-z",
      "--",
    ]),
  ]);

  const head = spawnSync(
    "git",
    ["rev-parse", "--verify", "--quiet", "--end-of-options", "HEAD^{commit}"],
    { cwd: root, encoding: "utf-8" }
  );

  if (head.status === 0) {
    const base = previous?.sha
      ? spawnSync(
          "git",
          [
            "rev-parse",
            "--verify",
            "--quiet",
            "--end-of-options",
            `${previous.sha}^{commit}`,
          ],
          { cwd: root, encoding: "utf-8" }
        )
      : null;

    const ancestor =
      base?.status === 0 &&
      spawnSync(
        "git",
        ["merge-base", "--is-ancestor", base.stdout.trim(), head.stdout.trim()],
        { cwd: root }
      ).status === 0;

    if (!ancestor) {
      warnings.push(
        previous
          ? "Latest learner event has no reachable historical commit; using the most recent 20 commits"
          : "No prior learner event; using the most recent 20 commits"
      );
    }

    const range = ancestor
      ? [`${base.stdout.trim()}..${head.stdout.trim()}`]
      : ["--max-count=20", head.stdout.trim()];

    for (const file of paths([
      "log",
      "--format=",
      "--name-only",
      "--no-relative",
      "--no-renames",
      "--diff-merges=first-parent",
      "-z",
      ...range,
      "--",
    ])) {
      changed.add(file);
    }
  } else {
    warnings.push(
      "No commits yet; in-play includes tracked working-tree and staged changes only"
    );
  }

  return {
    files: scopedFiles()
      .filter((file) => changed.has(file))
      .toSorted(),
    warnings,
  };
}

function map() {
  const result = withLock(status);

  const template = readFileSync(
    fileURLToPath(new URL("../templates/map.html", import.meta.url)),
    "utf-8"
  );

  // Escape script delimiters even inside JSON strings; visible text uses textContent.
  const json = JSON.stringify(result).replaceAll("<", "\\u003c");
  const path = join(state, "map.html");
  writeFileSync(
    path,
    template.replace("<!--STATUS_DATA-->", () => json)
  );

  let opener = "xdg-open";

  if (process.platform === "darwin") {
    opener = "open";
  } else if (process.platform === "win32") {
    opener = "rundll32";
  }

  const args =
    process.platform === "win32"
      ? ["url.dll,FileProtocolHandler", path]
      : [path];

  const opened = spawnSync(opener, args, {
    encoding: "utf-8",
    timeout: 10_000,
  });

  const success = !opened.error && opened.status === 0;

  return {
    opened: success,
    path,
    warnings: [
      ...result.warnings,
      ...(success
        ? []
        : [`Open ${path} in your browser; automatic opening failed`]),
    ],
  };
}

try {
  root = dirname(resolve(git("rev-parse", "--git-common-dir").trim()));

  if (existsSync(join(root, ".keepup")) && existsSync(join(root, ".cogdebt"))) {
    throw new Error(
      "Both .keepup and .cogdebt exist; choose one state directory before running up. No state was changed"
    );
  }

  state = join(root, ".keepup");

  if (existsSync(join(root, ".cogdebt"))) {
    state = join(root, ".cogdebt");
  }

  const command = process.argv.at(2);

  if (command === "init") {
    mkdirSync(state, { recursive: true });
    console.log(JSON.stringify(withLock(initialize)));
  } else if (command === "architecture") {
    console.log(
      architectureCommand(root, state, process.argv.slice(3), {
        config: readConfig,
        events: readEvents,
        files: scopedFiles,
        learner,
        locked: withLock,
        now,
        practice: recordArchitecturePractice,
      })
    );
  } else if (command === "log") {
    console.log(JSON.stringify(logEvent(JSON.parse(process.argv[3] ?? ""))));
  } else if (command === "status") {
    const result = withLock(status);
    console.log(
      process.argv.includes("--json")
        ? JSON.stringify(result)
        : textStatus(result)
    );
  } else if (command === "health") {
    console.log(
      JSON.stringify(
        withLock(() =>
          codeHealth(
            root,
            state,
            () => status(),
            process.argv[3] ? strings(JSON.parse(process.argv[3])) : undefined
          )
        )
      )
    );
  } else if (command === "map") {
    console.log(JSON.stringify(map()));
  } else if (command === "in-play") {
    console.log(JSON.stringify(withLock(inPlay)));
  } else {
    throw new Error(
      "Usage: up init | health [<assessment-ids-json>] | log <json> | status [--json] | map | in-play | architecture"
    );
  }
} catch (error) {
  console.error(
    `up: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
}
