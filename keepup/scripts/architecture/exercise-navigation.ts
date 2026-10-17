import type { ArchitectureAssessment } from "./domain.ts";
import type {
  ExerciseAssessmentInput,
  ExerciseHost,
  ExercisePreparation,
  ExercisePreparationInput,
} from "./exercise-domain.ts";
import {
  assertExerciseClean,
  exerciseInventory,
  exerciseTargetCount,
} from "./exercise-evidence.ts";
import { assertReviewedSource } from "./exercise-reviewed.ts";
import type { NavigabilityAssessmentInput } from "./navigability.ts";
import { inspectAssessment } from "./storage.ts";

export function validateNavigationPreparation(
  root: string,
  state: string,
  input: ExercisePreparationInput,
  assessment: ArchitectureAssessment,
  host: ExerciseHost
): Pick<
  ExercisePreparation,
  "assessment" | "inventory" | "targetBaseline" | "guardrails"
> & { readonly command: string } {
  const { target } = input;
  const definition = assessment.input;

  if (
    target.kind !== "navigability" ||
    definition.dimension !== "navigability"
  ) {
    throw new Error(
      "Navigation target requires a current navigability assessment"
    );
  }

  const selected = definition.questions.find(
    (question) => question.id === target.questionId
  );

  if (
    !selected ||
    selected.owningModule !== definition.module.id ||
    selected.trailStatus !== "complete" ||
    selected.readability !== "coherent" ||
    selected.disagreements.length ||
    definition.review.status !== "reviewed"
  ) {
    throw new Error(
      "Navigability requires a reviewed complete sufficient trail, unambiguous ownership and coherent readability"
    );
  }

  if (input.transformation || input.guardrails.length) {
    throw new Error(
      "Navigation reshaping and graph guardrails require separately supported preparation; seam safety remains unmeasured"
    );
  }

  const inventory = exerciseInventory(root, state);
  const scope = host.files();

  if (
    !inventory.revision ||
    !input.callers.length ||
    input.files.some((file) => !scope.includes(file)) ||
    input.files.some((file) => input.callers.includes(file)) ||
    !input.files.some((file) => definition.module.members.includes(file)) ||
    [...input.callers, ...selected.trail.map((step) => step.file)].some(
      (file) =>
        !inventory.manifest.some(
          (entry) => entry.path === file && entry.hash !== null
        )
    )
  ) {
    throw new Error(
      "Navigation scope must freeze existing owner/trail source and unchanged external callers; transferring work into callers is unsupported"
    );
  }

  assertExerciseClean(root, [...input.files, ...input.callers]);
  const targetBaseline = exerciseTargetCount(assessment, target);

  if (targetBaseline <= target.goal) {
    throw new Error(
      "Navigability goal must strictly shorten the same available necessary logical-module trail"
    );
  }

  const command = host.config().testCommand;

  if (!command) {
    throw new Error("An existing behavioural test command is required");
  }

  return { assessment, command, guardrails: [], inventory, targetBaseline };
}

export function assessNavigationExercise(
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
      "Accepted semantic source/readability review and exact-source navigation assessment are required"
    );
  }

  const inspection = inspectAssessment(root, state, input.reviewedAssessmentId);
  const after = inspection.assessment;
  const before = preparation.assessment.input;
  const current = after.input;
  const { target } = preparation.input;

  if (
    inspection.freshness.status !== "current" ||
    JSON.stringify(after.observation.manifest) !==
      JSON.stringify(exerciseInventory(root, state).manifest)
  ) {
    throw new Error(
      "Reviewed navigation assessment must describe this exact current candidate source"
    );
  }

  if (
    before.dimension !== "navigability" ||
    current.dimension !== "navigability" ||
    target.kind !== "navigability"
  ) {
    throw new Error(
      "Navigation requires comparable reviewed question evidence"
    );
  }

  assertNavigationInventory(before, current, target.questionId);

  if (
    current.review.status !== "reviewed" ||
    !changedFiles.some((file) => before.module.members.includes(file))
  ) {
    throw new Error(
      "Reviewed actual owning-module implementation improvement is required; metadata and renamed pass-throughs alone do not qualify"
    );
  }

  if (input.semanticReview.trustBoundaries.length) {
    throw new Error(
      "Navigation validation is reviewed through frozen invariants and unchanged positive/negative checks, not invented policy-site identities"
    );
  }

  assertReviewedSource(
    root,
    state,
    preparation,
    after,
    input.semanticReview,
    changedFiles
  );

  return after;
}

function assertNavigationInventory(
  before: NavigabilityAssessmentInput,
  after: NavigabilityAssessmentInput,
  questionId: string
): void {
  if (
    JSON.stringify(before.module) !== JSON.stringify(after.module) ||
    before.questions.length !== after.questions.length
  ) {
    throw new Error(
      "Original navigation owner, logical module membership and question inventory must remain frozen"
    );
  }

  for (const original of before.questions) {
    const current = after.questions.find(
      (question) => question.id === original.id
    );

    if (
      !current ||
      current.question !== original.question ||
      current.owningModule !== original.owningModule ||
      JSON.stringify(current.evidence) !== JSON.stringify(original.evidence)
    ) {
      throw new Error(
        "Exact comprehension question, owning module and sufficient source evidence cannot change or disappear"
      );
    }

    if (
      original.id !== questionId &&
      JSON.stringify(original) !== JSON.stringify(current)
    ) {
      throw new Error("Unselected navigation questions must remain frozen");
    }

    if (
      current.trailStatus !== "complete" ||
      current.readability !== "coherent" ||
      current.disagreements.length
    ) {
      throw new Error(
        "Incomplete/disputed trails, ambiguous ownership or obscured internal readability cannot establish improvement"
      );
    }

    const originalSites = original.trail.map((step) => ({
      file: step.file,
      id: step.id,
      kind: step.kind,
      location: step.location,
      moduleId: step.moduleId,
    }));

    const currentSites = current.trail.map((step) => ({
      file: step.file,
      id: step.id,
      kind: step.kind,
      location: step.location,
      moduleId: step.moduleId,
    }));

    if (JSON.stringify(originalSites) !== JSON.stringify(currentSites)) {
      throw new Error(
        "Original trail sites cannot be omitted, renamed, reattributed or recategorised; retain superseded steps as reviewed unnecessary evidence"
      );
    }
  }
}
