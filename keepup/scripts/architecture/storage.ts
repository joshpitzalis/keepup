import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

import type {
  ArchitectureAssessment,
  ArchitectureInspection,
  AssessmentInput,
  AssessmentMeasurements,
  ManifestEntry,
  InterfaceAssessmentInput,
} from "./domain.ts";
import {
  localityEvidence,
  localityLimitations,
  localityMeasurements,
} from "./locality.ts";
import { parseArchitectureId, parseAssessment } from "./parse.ts";

const ASSET_DIRECTORY = import.meta.dirname;

export function architectureDigest(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf-8" });

  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || "Cannot inspect architecture source"
    );
  }

  return result.stdout;
}

function fileHash(root: string, file: string): string | null {
  const path = join(root, file);

  if (!existsSync(path) || !lstatSync(path).isFile()) {
    return null;
  }

  const location = relative(root, realpathSync(path));

  if (location.startsWith("..") || isAbsolute(location)) {
    throw new Error(`Architecture source escapes repository: ${file}`);
  }

  return architectureDigest(readFileSync(path));
}

function sourcePaths(root: string): string[] {
  return git(root, "ls-files", "-z")
    .split("\0")
    .filter(
      (file) =>
        file &&
        ![".keepup", ".cogdebt", ".git"].some(
          (directory) => file === directory || file.startsWith(`${directory}/`)
        )
    )
    .toSorted();
}

export function manifest(root: string): ManifestEntry[] {
  return sourcePaths(root).map((path) => ({
    hash: fileHash(root, path),
    path,
  }));
}

export function assets(): ManifestEntry[] {
  return readdirSync(ASSET_DIRECTORY)
    .toSorted()
    .filter((name) => /\.(?:ts|md)$/u.test(name))
    .map((path) => ({ hash: fileHash(ASSET_DIRECTORY, path), path }));
}

export function revision(root: string): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf-8",
  });

  return result.status === 0 ? result.stdout.trim() : null;
}

export function referencedPaths(input: AssessmentInput): string[] {
  return [
    ...input.module.members,
    ...input.module.interface,
    ...input.evidence,
    ...(input.dimension === "change-locality"
      ? localityEvidence(input)
      : input.scenarios.flatMap((scenario) => [
          ...scenario.evidence,
          ...scenario.obligations.flatMap((obligation) => obligation.evidence),
        ])),
  ];
}

function interfaceLimitations(input: InterfaceAssessmentInput): string[] {
  const limitations: string[] = [];

  if (!input.scenarios.length) {
    limitations.push(
      "No representative scenarios; zero denominator is unavailable"
    );
  }

  for (const scenario of input.scenarios) {
    if (
      scenario.rating === null ||
      !scenario.evidence.length ||
      scenario.obligations.some((obligation) => !obligation.evidence.length)
    ) {
      limitations.push(
        `Scenario ${scenario.id}: missing rating or concrete evidence; unavailable`
      );
    }
  }

  return limitations;
}

function limitationsFor(input: AssessmentInput): string[] {
  const limitations = [
    ...input.limitations,
    ...(input.dimension === "change-locality"
      ? localityLimitations(input)
      : interfaceLimitations(input)),
  ];

  if (input.review.status === "provisional") {
    limitations.push(
      "Provisional suggestion; reviewer judgement has not been accepted"
    );
  }

  return limitations;
}

function measurements(input: AssessmentInput): AssessmentMeasurements {
  if (input.dimension === "change-locality") {
    return localityMeasurements(input);
  }

  const assessed = input.scenarios.filter(
    (scenario) =>
      scenario.rating !== null &&
      scenario.evidence.length &&
      scenario.obligations.every((obligation) => obligation.evidence.length)
  );

  const denominator = input.scenarios.length;
  const complete = denominator > 0 && assessed.length === denominator;

  const obligations = input.scenarios.flatMap(
    (scenario) => scenario.obligations
  );

  return {
    assessed: assessed.length,
    avoidableObligations: obligations.filter(
      (obligation) => obligation.classification === "avoidable"
    ).length,
    denominator,
    domainObligations: obligations.filter(
      (obligation) => obligation.classification === "domain"
    ).length,
    status: complete ? "measured" : "unavailable",
    value: complete
      ? assessed.reduce((sum, scenario) => sum + (scenario.rating ?? 0), 0) /
        denominator
      : null,
  };
}

export function atomicPublish(path: string, bytes: string | Buffer): boolean {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);

  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }

  try {
    linkSync(temporary, path);

    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return false;
    }

    throw error;
  } finally {
    unlinkSync(temporary);
  }
}

export function archive(
  root: string,
  state: string,
  entries: readonly ManifestEntry[]
): void {
  for (const entry of entries) {
    if (entry.hash === null) {
      continue;
    }

    const bytes = readFileSync(join(root, entry.path));

    if (architectureDigest(bytes) !== entry.hash) {
      throw new Error("Source changed during architecture capture; retry");
    }

    const path = join(state, "architecture", "snapshots", entry.hash);
    atomicPublish(path, bytes);

    if (architectureDigest(readFileSync(path)) !== entry.hash) {
      throw new Error("Damaged architecture snapshot; left untouched");
    }
  }
}

function assessmentPath(state: string, id: string): string {
  return join(
    state,
    "architecture",
    "observations",
    `${parseArchitectureId(id)}.json`
  );
}

/* oxlint-disable anti-slop/no-runtime-typeof -- Stored JSON metadata is checked at this persistence boundary. */
export function verifySnapshots(
  state: string,
  entries: readonly ManifestEntry[]
): void {
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !(
        entry.hash === null ||
        (typeof entry.hash === "string" && /^[a-f0-9]{64}$/u.test(entry.hash))
      )
    ) {
      throw new Error("Invalid architecture manifest; left untouched");
    }

    if (entry.hash !== null) {
      const snapshot = join(state, "architecture", "snapshots", entry.hash);

      if (
        !existsSync(snapshot) ||
        architectureDigest(readFileSync(snapshot)) !== entry.hash
      ) {
        throw new Error("Damaged architecture snapshot; left untouched");
      }
    }
  }
}

export function readAssessment(
  state: string,
  id: string
): ArchitectureAssessment {
  const envelope = JSON.parse(readFileSync(assessmentPath(state, id), "utf-8"));

  if (
    !envelope ||
    typeof envelope.payload !== "string" ||
    architectureDigest(envelope.payload) !== envelope.digest
  ) {
    throw new Error("Invalid architecture record; left untouched");
  }

  const result = JSON.parse(envelope.payload);

  if (
    result.schemaVersion !== 1 ||
    result.id !== id ||
    !result.observation ||
    !Array.isArray(result.observation.manifest) ||
    !Array.isArray(result.observation.assets)
  ) {
    throw new Error("Invalid architecture schema; left untouched");
  }

  const input = parseAssessment(result.input);

  if (
    architectureDigest(JSON.stringify(input)) !== result.inputDigest ||
    result.dimension !== input.dimension ||
    result.method !== "reviewed" ||
    JSON.stringify(result.measurements) !==
      JSON.stringify(measurements(input)) ||
    typeof result.observation.id !== "string" ||
    !Number.isFinite(Date.parse(result.observation.time)) ||
    typeof result.observation.observer !== "string"
  ) {
    throw new Error("Invalid architecture input digest; left untouched");
  }

  verifySnapshots(state, [
    ...result.observation.manifest,
    ...result.observation.assets,
  ]);

  return result;
}

/* oxlint-enable anti-slop/no-runtime-typeof */
export function recordAssessment(
  root: string,
  state: string,
  input: AssessmentInput
): ArchitectureAssessment {
  if (!existsSync(join(state, "config.json"))) {
    throw new Error("Run keepup init before recording architecture evidence");
  }

  const inputDigest = architectureDigest(JSON.stringify(input));
  const path = assessmentPath(state, input.id);

  if (existsSync(path)) {
    const previous = readAssessment(state, input.id);

    if (previous.inputDigest !== inputDigest) {
      throw new Error(
        "Architecture retry id already used with different input"
      );
    }

    return previous;
  }

  const before = manifest(root);
  const tracked = new Set(before.map((entry) => entry.path));

  for (const file of referencedPaths(input)) {
    if (!tracked.has(file) || fileHash(root, file) === null) {
      throw new Error(
        `Architecture evidence must be a tracked regular source file: ${file}`
      );
    }
  }

  const capturedAssets = assets();
  const sha = revision(root);
  archive(root, state, before);
  archive(ASSET_DIRECTORY, state, capturedAssets);

  if (
    JSON.stringify(before) !== JSON.stringify(manifest(root)) ||
    JSON.stringify(capturedAssets) !== JSON.stringify(assets()) ||
    sha !== revision(root)
  ) {
    throw new Error("Source changed during architecture capture; retry");
  }

  const observer = git(root, "config", "user.email").trim();

  if (!observer) {
    throw new Error(
      "Set git user.email before recording architecture evidence"
    );
  }

  const result: ArchitectureAssessment = {
    coverage: {
      assessed: measurements(input).assessed,
      total: measurements(input).denominator,
    },
    dimension: input.dimension,
    id: input.id,
    input,
    inputDigest,
    limitations: limitationsFor(input),
    measurements: measurements(input),
    method: "reviewed",
    observation: {
      assets: capturedAssets,
      id: randomUUID(),
      manifest: before,
      observer,
      revision: sha,
      rubric:
        input.dimension === "change-locality"
          ? "experimental-change-locality-v1"
          : "experimental-interface-leverage-v1",
      time: new Date().toISOString(),
    },
    schemaVersion: 1,
  };

  const payload = JSON.stringify(result);

  if (
    !atomicPublish(
      path,
      JSON.stringify({ digest: architectureDigest(payload), payload })
    )
  ) {
    const winner = readAssessment(state, input.id);

    if (winner.inputDigest !== inputDigest) {
      throw new Error(
        "Architecture retry id already used with different input"
      );
    }

    return winner;
  }

  return result;
}

export function inspectAssessment(
  root: string,
  state: string,
  id: string
): ArchitectureInspection {
  const assessment = readAssessment(state, id);
  const current = manifest(root);

  const capturedHashes = new Map(
    assessment.observation.manifest.map((entry) => [entry.path, entry.hash])
  );

  const currentHashes = new Map(
    current.map((entry) => [entry.path, entry.hash])
  );

  const changed = new Set<string>();

  for (const entry of [...assessment.observation.manifest, ...current]) {
    if (capturedHashes.get(entry.path) !== currentHashes.get(entry.path)) {
      changed.add(entry.path);
    }
  }

  if (
    JSON.stringify(assessment.observation.assets) !== JSON.stringify(assets())
  ) {
    changed.add("evaluator assets or rubric");
  }

  return {
    assessment,
    freshness: {
      changed: [...changed].toSorted(),
      status: changed.size ? "stale" : "current",
    },
  };
}

export function listAssessments(state: string): string[] {
  const path = join(state, "architecture", "observations");

  return existsSync(path)
    ? readdirSync(path)
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -5))
        .toSorted()
    : [];
}
