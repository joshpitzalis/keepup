import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import type { StoredEvent } from "../keepup.ts";
import type { ArchitectureAssessment, ManifestEntry } from "./domain.ts";
import type {
  ExerciseGuardrail,
  ExerciseInventory,
  ExercisePreparation,
  ExerciseTarget,
} from "./exercise-domain.ts";
import { navigabilityMeasurements } from "./navigability.ts";
import type { SeamAnalysis } from "./seam-domain.ts";
import { architectureDigest, assets, manifest, revision } from "./storage.ts";
import { testabilityMeasurements } from "./testability.ts";

export function exerciseGit(root: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf-8" });

  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || "Cannot inspect exercise source inventory"
    );
  }

  return result.stdout;
}

export const EXERCISE_HOST_DIRECTORY = resolve(import.meta.dirname, "../..");

export function exerciseHostAssets(): ManifestEntry[] {
  const paths = [
    "package.json",
    "SKILL.md",
    "scripts/keepup.ts",
    "scripts/keepup.mjs",
    "references/architecture-exercise.md",
    ...readdirSync(join(EXERCISE_HOST_DIRECTORY, "scripts/handlers"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `scripts/handlers/${name}`),
  ];

  return paths.toSorted().map((path) => ({
    hash: architectureDigest(readFileSync(join(EXERCISE_HOST_DIRECTORY, path))),
    path,
  }));
}

export function exerciseInventory(
  root: string,
  state: string
): ExerciseInventory {
  const untracked = exerciseGit(
    root,
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z"
  )
    .split("\0")
    .filter(
      (path) =>
        path && !path.startsWith(".keepup/") && !path.startsWith(".cogdebt/")
    )
    .toSorted()
    .map((path) => ({
      hash:
        existsSync(join(root, path)) && lstatSync(join(root, path)).isFile()
          ? architectureDigest(readFileSync(join(root, path)))
          : null,
      path,
    }));

  const environment = Object.entries(process.env)
    .filter(([key]) => !["KEEPUP_NOW", "COGDEBT_NOW", "_"].includes(key))
    .toSorted(([one], [two]) => one.localeCompare(two));

  const sources = manifest(root);

  const indexModes = exerciseGit(root, "ls-files", "--stage", "-z")
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({
      mode: entry.slice(0, entry.indexOf(" ")),
      path: entry.slice(entry.indexOf("\t") + 1),
    }));

  return {
    assets: assets(),
    configHash: architectureDigest(readFileSync(join(state, "config.json"))),
    environmentHash: architectureDigest(JSON.stringify(environment)),
    hostAssets: exerciseHostAssets(),
    indexModes,
    manifest: sources,
    revision: revision(root),
    runtime: process.version,
    sourceModes: sources.map((entry) => ({
      executable:
        entry.hash === null
          ? null
          : Boolean(lstatSync(join(root, entry.path)).mode & 0o111),
      path: entry.path,
    })),
    untracked,
  };
}

export function assertExerciseClean(
  root: string,
  files: readonly string[]
): void {
  if (exerciseGit(root, "status", "--porcelain", "-z", "--", ...files)) {
    throw new Error(
      "Architecture exercise target files must be clean, including staged changes"
    );
  }
}

export function assertExerciseStable(
  root: string,
  state: string,
  expected: ExerciseInventory
): void {
  if (
    JSON.stringify(expected) !== JSON.stringify(exerciseInventory(root, state))
  ) {
    throw new Error(
      "Source, HEAD, evaluator definitions, test configuration, environment or file inventory changed after exercise preparation; preserve the baseline and prepare a fresh context"
    );
  }
}

export { runExerciseTests } from "./exercise-tests.ts";

export function exerciseSeamAnalysis(
  assessment: ArchitectureAssessment
): SeamAnalysis {
  const { analysis } = assessment;

  if (
    assessment.input.dimension !== "seam-integrity" ||
    !analysis ||
    !("findings" in analysis) ||
    analysis.status !== "complete"
  ) {
    throw new Error(
      "Architecture target requires complete deterministic seam analysis"
    );
  }

  return analysis;
}

function navigationTargetCount(
  assessment: ArchitectureAssessment,
  questionId: string
): number {
  if (assessment.input.dimension !== "navigability") {
    throw new Error("Navigation target requires navigability evidence");
  }

  const selected = navigabilityMeasurements(assessment.input).questions.find(
    (question) => question.id === questionId
  );

  if (!selected || selected.transitions === null) {
    throw new Error(
      "Navigation target needs a complete sufficient trail, unambiguous owner and coherent readability"
    );
  }

  return selected.transitions;
}

export function exerciseTargetCount(
  assessment: ArchitectureAssessment,
  target: ExerciseTarget
): number {
  if (target.kind === "navigability") {
    return navigationTargetCount(assessment, target.questionId);
  }

  if (target.kind === "interface-leverage") {
    if (assessment.input.dimension !== "interface-leverage") {
      throw new Error("Interface target requires interface evidence");
    }

    return assessment.input.scenarios
      .flatMap((scenario) => scenario.obligations)
      .filter(
        (obligation) =>
          obligation.classification === "avoidable" &&
          obligation.kind === target.obligationKind &&
          obligation.description === target.obligation
      ).length;
  }

  if (target.kind === "behavioural-testability") {
    if (
      assessment.input.dimension !== "behavioural-testability" ||
      !assessment.analysis ||
      !("kind" in assessment.analysis) ||
      assessment.analysis.kind !== "testability"
    ) {
      throw new Error(
        "Testability target requires CLI-owned scenario execution"
      );
    }

    const result = testabilityMeasurements(
      assessment.input,
      assessment.analysis
    ).scenarios.find((scenario) => scenario.id === target.scenarioId);

    if (!result || result.status === "unavailable") {
      throw new Error("Selected scenario evidence unavailable");
    }

    return result.status === "qualifying" ? 0 : 1;
  }

  if (target.kind === "change-locality") {
    if (assessment.input.dimension !== "change-locality") {
      throw new Error("Locality target requires locality evidence");
    }

    const rule = assessment.input.rules.find(
      (entry) => entry.id === target.ruleId
    );

    if (!rule || rule.status !== "confirmed") {
      throw new Error("Locality target requires a confirmed policy");
    }

    return rule.sites.filter((site) => site.role === "policy").length;
  }

  const analysis = exerciseSeamAnalysis(assessment);

  if (target.kind === "prohibited-cycle") {
    return (analysis.cycles ?? []).filter(
      (group) =>
        group.policyId === target.ruleId &&
        group.permittedBy === null &&
        group.modules.some((module) => target.modules.includes(module))
    ).length;
  }

  return analysis.findings.filter((finding) => finding.ruleId === target.ruleId)
    .length;
}

export function exerciseGuardrailCount(
  assessment: ArchitectureAssessment,
  guardrail: ExerciseGuardrail
): number {
  const analysis = exerciseSeamAnalysis(assessment);

  return analysis.findings.filter(
    (finding) => finding.ruleId === guardrail.ruleId
  ).length;
}

export function activeOrdinaryKata(events: readonly StoredEvent[]): boolean {
  return events.some(
    (event) =>
      event.type === "kata_start" &&
      !events.some(
        (later) =>
          later.who === event.who &&
          later.type === "kata_submit" &&
          later.kataNumber === event.kataNumber &&
          (later.result === "pass" || later.result === "abandon")
      )
  );
}

export function linkedPreQuizzes(
  state: string,
  preparation: ExercisePreparation,
  events: readonly StoredEvent[],
  ids: readonly string[]
): readonly StoredEvent[] {
  const quizzes = ids.map((id) => {
    const event = events.find(
      (candidate) =>
        candidate.id === id && candidate.who === preparation.learner
    );

    if (
      !event ||
      !event.id.startsWith(preparation.quizPrefix) ||
      event.type !== "quiz" ||
      event.phase !== "pre" ||
      event.kataNumber !== undefined ||
      Date.parse(event.t) < Date.parse(preparation.time) ||
      event.sha !== preparation.inventory.revision ||
      event.files.some((file) => !preparation.input.files.includes(file))
    ) {
      throw new Error(
        "Pre-quiz must contain actual standalone answers from this learner after preparation against the frozen source"
      );
    }

    for (const file of event.files) {
      const hash = preparation.inventory.manifest.find(
        (entry) => entry.path === file
      )?.hash;

      if (
        !hash ||
        event.snapshots[file] !== hash ||
        architectureDigest(readFileSync(join(state, "snapshots", hash))) !==
          hash
      ) {
        throw new Error(
          "Pre-quiz snapshot does not match exercise preparation"
        );
      }
    }

    return event;
  });

  const concepts = quizzes
    .flatMap((event) =>
      event.type === "quiz"
        ? event.answers.map((answer) =>
            JSON.stringify({ concept: answer.concept, file: answer.file })
          )
        : []
    )
    .toSorted();

  const expected = preparation.input.concepts
    .map((concept) => JSON.stringify(concept))
    .toSorted();

  if (JSON.stringify(concepts) !== JSON.stringify(expected)) {
    throw new Error(
      "Actual pre-quiz answers must cover exactly the prepared file/concepts without fabricated or duplicate responses"
    );
  }

  return quizzes;
}

export function exerciseCommits(
  root: string,
  beforeRevision: string | null,
  afterRevision: string | null,
  files: readonly string[],
  tests: readonly string[],
  learner: string
): readonly string[] {
  if (!beforeRevision || !afterRevision) {
    throw new Error("Missing original or candidate commit identity");
  }

  exerciseGit(
    root,
    "merge-base",
    "--is-ancestor",
    beforeRevision,
    afterRevision
  );

  const commits = exerciseGit(
    root,
    "rev-list",
    "--reverse",
    `${beforeRevision}..${afterRevision}`
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  for (const commit of commits) {
    const parents = exerciseGit(root, "show", "-s", "--format=%P", commit)
      .trim()
      .split(" ");

    const authors = exerciseGit(
      root,
      "show",
      "-s",
      "--format=%ae%x00%ce",
      commit
    )
      .trim()
      .split("\0");

    const paths = exerciseGit(
      root,
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      commit
    )
      .split("\0")
      .filter(Boolean);

    if (
      parents.length !== 1 ||
      authors.some((email) => email !== learner) ||
      paths.some((file) => !files.includes(file) || tests.includes(file))
    ) {
      throw new Error(
        "Unexpected commit: only linear learner-authored and learner-committed changes within the frozen existing-file scope are supported"
      );
    }
  }

  return commits;
}
