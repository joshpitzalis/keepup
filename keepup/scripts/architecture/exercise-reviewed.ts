import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ArchitectureAssessment } from "./domain.ts";
import type {
  ExerciseAssessmentInput,
  ExerciseHost,
  ExercisePreparation,
  ExercisePreparationInput,
  ExerciseSemanticReview,
} from "./exercise-domain.ts";
import {
  assertExerciseClean,
  exerciseInventory,
  exerciseTargetCount,
} from "./exercise-evidence.ts";
import type { LocalityAssessmentInput } from "./locality.ts";
import { inspectAssessment } from "./storage.ts";

export function validateLocalityPreparation(
  root: string,
  state: string,
  input: ExercisePreparationInput,
  assessment: ArchitectureAssessment,
  host: ExerciseHost
): Pick<
  ExercisePreparation,
  "assessment" | "inventory" | "targetBaseline" | "guardrails"
> & { readonly command: string } {
  const declaration = assessment.input;

  if (
    input.target.kind !== "change-locality" ||
    declaration.dimension !== "change-locality"
  ) {
    throw new Error("Locality target requires a current locality assessment");
  }

  const selectedId = input.target.ruleId;
  const rule = declaration.rules.find((entry) => entry.id === selectedId);

  if (
    !rule ||
    rule.status !== "confirmed" ||
    !rule.equivalence ||
    declaration.review.status !== "reviewed" ||
    declaration.disagreements.length ||
    assessment.measurements.status !== "measured" ||
    !declaration.changes.length
  ) {
    throw new Error(
      "Locality requires confirmed equivalence, reviewed complete policy evidence and representative changes"
    );
  }

  if (input.transformation || input.guardrails.length) {
    throw new Error(
      "Locality reshaping and graph guardrails require separately supported preparation; seam safety remains unmeasured"
    );
  }

  const inventory = exerciseInventory(root, state);
  const scope = host.files();

  if (
    !inventory.revision ||
    !input.callers.length ||
    input.files.some((file) => !scope.includes(file)) ||
    input.callers.some(
      (file) =>
        !inventory.manifest.some(
          (entry) => entry.path === file && entry.hash !== null
        )
    ) ||
    rule.sites.some(
      (site) =>
        !input.files.includes(site.file) && !input.callers.includes(site.file)
    )
  ) {
    throw new Error(
      "Locality scope must freeze existing implementation sites and callers"
    );
  }

  assertExerciseClean(root, [...input.files, ...input.callers]);
  const targetBaseline = exerciseTargetCount(assessment, input.target);

  if (targetBaseline <= input.target.goal) {
    throw new Error(
      "Locality target needs independently maintained equivalent implementations"
    );
  }

  const command = host.config().testCommand;

  if (!command) {
    throw new Error("An existing behavioural test command is required");
  }

  return { assessment, command, guardrails: [], inventory, targetBaseline };
}

export function reviewedExerciseAssessment(
  root: string,
  state: string,
  preparation: ExercisePreparation,
  input: ExerciseAssessmentInput,
  changedFiles: readonly string[]
): ArchitectureAssessment {
  if (
    !input.reviewedAssessmentId ||
    !input.semanticReview ||
    input.semanticReview.status !== "reviewed"
  ) {
    throw new Error(
      "Accepted semantic review and exact-source reviewed assessment are required"
    );
  }

  const inspection = inspectAssessment(root, state, input.reviewedAssessmentId);
  const after = inspection.assessment;
  const before = preparation.assessment.input;
  const current = after.input;

  if (
    inspection.freshness.status !== "current" ||
    JSON.stringify(after.observation.manifest) !==
      JSON.stringify(exerciseInventory(root, state).manifest)
  ) {
    throw new Error(
      "Reviewed assessment must describe this exact current candidate source"
    );
  }

  if (
    before.dimension !== "change-locality" ||
    current.dimension !== "change-locality" ||
    preparation.input.target.kind !== "change-locality"
  ) {
    throw new Error("Unsupported reviewed exercise dimension");
  }

  if (after.measurements.status !== "measured") {
    throw new Error("Reviewed measurements are incomplete");
  }

  assertLocalityPolicy(before, current, preparation.input.target.ruleId);
  assertReviewedSource(
    root,
    state,
    preparation,
    after,
    input.semanticReview,
    changedFiles
  );
  assertTrustBoundaries(before, input.semanticReview);

  return after;
}

function assertLocalityPolicy(
  before: LocalityAssessmentInput,
  current: LocalityAssessmentInput,
  targetId: string
): void {
  if (
    current.review.status !== "reviewed" ||
    current.disagreements.length ||
    JSON.stringify(before.module) !== JSON.stringify(current.module) ||
    JSON.stringify(before.changes) !== JSON.stringify(current.changes) ||
    JSON.stringify(
      before.rules.map((rule) => ({
        description: rule.description,
        equivalence: rule.equivalence,
        id: rule.id,
        status: rule.status,
      }))
    ) !==
      JSON.stringify(
        current.rules.map((rule) => ({
          description: rule.description,
          equivalence: rule.equivalence,
          id: rule.id,
          status: rule.status,
        }))
      )
  ) {
    throw new Error(
      "Frozen logical subject, policy meaning and representative scenarios must remain comparable and reviewed"
    );
  }

  for (const original of before.rules) {
    const candidate = current.rules.find((rule) => rule.id === original.id);

    if (
      !candidate ||
      JSON.stringify(
        original.sites.map((site) => ({
          file: site.file,
          id: site.id,
          trustBoundary: site.trustBoundary,
        }))
      ) !==
        JSON.stringify(
          candidate.sites.map((site) => ({
            file: site.file,
            id: site.id,
            trustBoundary: site.trustBoundary,
          }))
        )
    ) {
      throw new Error(
        "Original policy sites and trust boundaries cannot be omitted or moved"
      );
    }

    if (
      original.id !== targetId &&
      JSON.stringify(original) !== JSON.stringify(candidate)
    ) {
      throw new Error("Unselected policy inventories must remain frozen");
    }

    const policies = candidate.sites.filter((site) => site.role === "policy");

    if (
      candidate.sites.some(
        (site) =>
          site.role === "call" &&
          !policies.some((policy) => policy.id === site.implementation)
      )
    ) {
      throw new Error(
        "Calls must name a surviving authoritative implementation"
      );
    }
  }
}

export function assertReviewedSource(
  root: string,
  state: string,
  preparation: ExercisePreparation,
  after: ArchitectureAssessment,
  review: ExerciseSemanticReview,
  changedFiles: readonly string[]
): void {
  if (
    changedFiles.some(
      (file) => !review.changes.some((change) => change.file === file)
    ) ||
    preparation.input.callers.some(
      (file) => !review.callers.some((caller) => caller.file === file)
    ) ||
    !review.changes.length ||
    !review.callers.length
  ) {
    throw new Error(
      "Review must cover actual changed source, callers and consolidation diff"
    );
  }

  for (const change of review.changes) {
    const hash = preparation.inventory.manifest.find(
      (entry) => entry.path === change.file
    )?.hash;

    const candidate = after.observation.manifest.find(
      (entry) => entry.path === change.file
    )?.hash;

    if (
      !hash ||
      !candidate ||
      !changedFiles.includes(change.file) ||
      change.before === change.after ||
      !readFileSync(
        join(state, "architecture/snapshots", hash),
        "utf-8"
      ).includes(change.before) ||
      !readFileSync(join(root, change.file), "utf-8").includes(change.after)
    ) {
      throw new Error(
        "Review before/after excerpts must match actual changed implementation source"
      );
    }
  }

  for (const caller of review.callers) {
    if (
      !preparation.input.callers.includes(caller.file) ||
      !readFileSync(join(root, caller.file), "utf-8").includes(caller.excerpt)
    ) {
      throw new Error(
        "Review caller evidence must match frozen actual caller source"
      );
    }
  }
}

function assertTrustBoundaries(
  before: LocalityAssessmentInput,
  review: ExerciseSemanticReview
): void {
  const boundaries = before.rules.flatMap((rule) =>
    rule.sites.filter((site) => site.trustBoundary !== null)
  );

  if (
    review.trustBoundaries.length !== boundaries.length ||
    new Set(review.trustBoundaries.map((boundary) => boundary.siteId)).size !==
      boundaries.length ||
    boundaries.some(
      (site) =>
        !review.trustBoundaries.some(
          (boundary) => boundary.siteId === site.id && boundary.preserved
        )
    )
  ) {
    throw new Error(
      "Every original necessary trust-boundary validation requires explicit preserved review"
    );
  }
}
