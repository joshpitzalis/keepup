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

import { analyserToolChanged, workingTreeSourcePaths } from "./analyser.ts";
import type {
  ArchitectureAssessment,
  ArchitectureInspection,
  AssessmentInput,
  AssessmentMeasurements,
  ManifestEntry,
  InterfaceAssessmentInput,
  WorkingTreePaths,
} from "./domain.ts";
import {
  localityEvidence,
  localityLimitations,
  localityMeasurements,
} from "./locality.ts";
import {
  navigabilityEvidence,
  navigabilityLimitations,
  navigabilityMeasurements,
} from "./navigability.ts";
import { object, strings } from "./parse-common.ts";
import { parseArchitectureId, parseAssessment } from "./parse.ts";
import type { SeamAnalysis } from "./seam-domain.ts";
import { seamMeasurements } from "./seams.ts";
import type { TestabilityAnalysis } from "./testability.ts";
import {
  testabilityEvidence,
  testabilityLimitations,
  testabilityMeasurements,
} from "./testability.ts";

type AssessmentAnalysis = SeamAnalysis | TestabilityAnalysis;

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

export function manifest(
  root: string,
  workingTree?: WorkingTreePaths
): ManifestEntry[] {
  const files = workingTree
    ? workingTreeSourcePaths(root, workingTree)
    : sourcePaths(root);

  return files.map((path) => ({
    hash: fileHash(root, path),
    path,
  }));
}

export function assets(): ManifestEntry[] {
  return readdirSync(ASSET_DIRECTORY)
    .toSorted()
    .filter((name) => /\.(?:ts|md|json)$/u.test(name))
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
  if (input.dimension === "navigability") {
    return [
      ...input.module.members,
      ...input.module.interface,
      ...input.evidence,
      ...navigabilityEvidence(input),
    ];
  }

  if (input.dimension === "behavioural-testability") {
    return [
      ...input.module.members,
      ...input.module.interface,
      ...input.evidence,
      ...testabilityEvidence(input),
    ];
  }

  if (input.dimension === "seam-integrity") {
    return [
      ...input.modules.flatMap((module) => [
        ...module.members,
        ...module.interface,
      ]),
      ...input.evidence,
    ];
  }

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

function limitationsFor(
  input: AssessmentInput,
  analysis?: AssessmentAnalysis
): string[] {
  if (input.dimension === "navigability") {
    return [
      ...input.limitations,
      ...navigabilityLimitations(input),
      ...(input.review.status === "provisional"
        ? ["Provisional suggestion; review not accepted"]
        : []),
    ];
  }

  if (input.dimension === "behavioural-testability") {
    return [
      ...input.limitations,
      ...testabilityLimitations(
        input,
        analysis && "kind" in analysis ? analysis : undefined
      ),
      ...(input.review.status === "provisional"
        ? ["Provisional suggestion; review not accepted"]
        : []),
    ];
  }

  if (input.dimension === "seam-integrity") {
    return [...input.limitations];
  }

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

function measurements(
  input: AssessmentInput,
  analysis?: AssessmentAnalysis
): AssessmentMeasurements {
  if (input.dimension === "navigability") {
    return navigabilityMeasurements(input);
  }

  if (input.dimension === "behavioural-testability") {
    return testabilityMeasurements(
      input,
      analysis && "kind" in analysis ? analysis : undefined
    );
  }

  if (input.dimension === "seam-integrity") {
    if (!analysis || !("tool" in analysis)) {
      throw new Error("Automated seam analysis is CLI-owned");
    }

    return seamMeasurements(analysis);
  }

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

function verifyWorkingTreeObservation(
  observation: ArchitectureAssessment["observation"]
): void {
  if (observation.workingTree === undefined) {
    return;
  }

  const workingTree = object(observation.workingTree);

  const paths = [
    ...strings(workingTree.additions),
    ...strings(workingTree.removals),
  ];

  strings(observation.tracking);

  if (new Set(paths).size !== paths.length) {
    throw new Error(
      "Invalid architecture working-tree inventory; left untouched"
    );
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

  verifyWorkingTreeObservation(result.observation);

  if (
    architectureDigest(JSON.stringify(input)) !== result.inputDigest ||
    result.dimension !== input.dimension ||
    result.method !==
      (input.dimension === "seam-integrity" ? "automated" : "reviewed") ||
    JSON.stringify(result.measurements) !==
      JSON.stringify(measurements(input, result.analysis)) ||
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

  if (result.analysis && "tool" in result.analysis && result.analysis.tool) {
    verifySnapshots(state, result.analysis.tool.assets);
  }

  return result;
}

/* oxlint-enable anti-slop/no-runtime-typeof */
interface AssessmentCoverage {
  readonly assessed: number;
  readonly total: number;
}

function coverageFor(
  input: AssessmentInput,
  analysis: AssessmentAnalysis | undefined
): AssessmentCoverage {
  if (input.dimension === "seam-integrity") {
    return {
      assessed:
        (analysis && "tool" in analysis
          ? analysis
          : undefined
        )?.analysedFiles.filter((file) =>
          input.modules.some((module) => module.members.includes(file))
        ).length ?? 0,
      total: input.modules.flatMap((module) => module.members).length,
    };
  }

  return {
    assessed: measurements(input, analysis).assessed,
    total: measurements(input, analysis).denominator,
  };
}

function evaluateAssessment<Input extends AssessmentInput>(
  input: Input,
  evaluate: ((input: Input) => AssessmentAnalysis) | undefined
): AssessmentAnalysis | undefined {
  if (
    input.dimension !== "seam-integrity" &&
    input.dimension !== "behavioural-testability"
  ) {
    return undefined;
  }

  if (!evaluate) {
    throw new Error(
      "Automated evaluation is CLI-owned; use architecture analyse or testability"
    );
  }

  const analysis = evaluate(input);

  if ((input.dimension === "seam-integrity") !== "tool" in analysis) {
    throw new Error("Evaluator result does not match assessment dimension");
  }

  return analysis;
}

function sameAssessmentInput(
  assessment: ArchitectureAssessment,
  inputDigest: string,
  workingTree: WorkingTreePaths | undefined
): boolean {
  return (
    assessment.inputDigest === inputDigest &&
    JSON.stringify(assessment.observation.workingTree) ===
      JSON.stringify(workingTree)
  );
}

function trackingInventory(root: string): string[] {
  return git(root, "ls-files", "-z").split("\0").filter(Boolean).toSorted();
}

export function recordAssessment<Input extends AssessmentInput>(
  root: string,
  state: string,
  input: Input,
  evaluate?: (input: Input) => AssessmentAnalysis,
  workingTree?: WorkingTreePaths
): ArchitectureAssessment {
  if (!existsSync(join(state, "config.json"))) {
    throw new Error("Run up init before recording architecture evidence");
  }

  const inputDigest = architectureDigest(JSON.stringify(input));
  const path = assessmentPath(state, input.id);

  if (existsSync(path)) {
    const previous = readAssessment(state, input.id);

    if (!sameAssessmentInput(previous, inputDigest, workingTree)) {
      throw new Error(
        "Architecture retry id already used with different input"
      );
    }

    return previous;
  }

  const before = manifest(root, workingTree);

  const tracking = trackingInventory(root);

  const tracked = new Set(before.map((entry) => entry.path));

  for (const file of referencedPaths(input)) {
    if (!tracked.has(file) || fileHash(root, file) === null) {
      throw new Error(
        `Architecture evidence must be a tracked or declared working-tree regular source file: ${file}`
      );
    }
  }

  const capturedAssets = assets();
  const sha = revision(root);
  const analysis = evaluateAssessment(input, evaluate);
  archive(root, state, before);
  archive(ASSET_DIRECTORY, state, capturedAssets);

  archiveAnalysis(state, analysis);

  if (
    JSON.stringify(before) !== JSON.stringify(manifest(root, workingTree)) ||
    JSON.stringify(tracking) !== JSON.stringify(trackingInventory(root)) ||
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

  const observationMetadata = {
    assets: capturedAssets,
    id: randomUUID(),
    manifest: before,
    observer,
    revision: sha,
    rubric: `experimental-${input.dimension}-v1`,
    time: new Date().toISOString(),
  };

  const result: ArchitectureAssessment = {
    coverage: coverageFor(input, analysis),
    dimension: input.dimension,
    id: input.id,
    input,
    inputDigest,
    limitations: [
      ...limitationsFor(input, analysis),
      ...(analysis && "tool" in analysis ? analysis.limitations : []),
    ],
    measurements: measurements(input, analysis),
    method: input.dimension === "seam-integrity" ? "automated" : "reviewed",
    observation: workingTree
      ? { ...observationMetadata, tracking, workingTree }
      : observationMetadata,
    schemaVersion: 1,
  };

  const observation = analysis ? { ...result, analysis } : result;
  const payload = JSON.stringify(observation);

  if (
    !atomicPublish(
      path,
      JSON.stringify({ digest: architectureDigest(payload), payload })
    )
  ) {
    const winner = readAssessment(state, input.id);

    if (!sameAssessmentInput(winner, inputDigest, workingTree)) {
      throw new Error(
        "Architecture retry id already used with different input"
      );
    }

    return winner;
  }

  return observation;
}

export function inspectAssessment(
  root: string,
  state: string,
  id: string
): ArchitectureInspection {
  const assessment = readAssessment(state, id);
  let current: ManifestEntry[];
  const changed = new Set<string>();

  try {
    current = manifest(root, assessment.observation.workingTree);
  } catch (error) {
    current = manifest(root);
    changed.add(
      error instanceof Error ? error.message : "Working-tree inventory changed"
    );
  }

  if (
    assessment.observation.tracking &&
    JSON.stringify(assessment.observation.tracking) !==
      JSON.stringify(trackingInventory(root))
  ) {
    changed.add("source tracking inventory");
  }

  const capturedHashes = new Map(
    assessment.observation.manifest.map((entry) => [entry.path, entry.hash])
  );

  const currentHashes = new Map(
    current.map((entry) => [entry.path, entry.hash])
  );

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

  if (
    assessment.analysis &&
    "tool" in assessment.analysis &&
    assessment.analysis.tool &&
    analyserToolChanged(assessment.analysis.tool)
  ) {
    changed.add("analyser assets or version");
  }

  if (
    assessment.analysis &&
    "kind" in assessment.analysis &&
    (assessment.analysis.environment.node !== process.version ||
      assessment.analysis.environment.platform !== process.platform)
  ) {
    changed.add("test execution environment");
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

function archiveAnalysis(
  state: string,
  analysis: AssessmentAnalysis | undefined
): void {
  if (analysis && "tool" in analysis && analysis.tool) {
    archive(analysis.tool.directory, state, analysis.tool.assets);
  }
}
