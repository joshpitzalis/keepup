import type {
  ArchitectureAssessment,
  CallerObligation,
  InterfaceAssessmentInput,
} from "./domain.ts";
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
import { inspectAssessment } from "./storage.ts";

export function interfaceObligationMatches(
  obligation: CallerObligation,
  kind: CallerObligation["kind"],
  description: string
): boolean {
  return (
    obligation.classification === "avoidable" &&
    obligation.kind === kind &&
    obligation.description === description
  );
}

export function validateInterfacePreparation(
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
    target.kind !== "interface-leverage" ||
    definition.dimension !== "interface-leverage"
  ) {
    throw new Error(
      "Interface target requires a current interface-leverage assessment"
    );
  }

  const scenario = definition.scenarios.find(
    (entry) => entry.id === target.scenarioId
  );

  if (
    !scenario ||
    !scenario.obligations.some((obligation) =>
      interfaceObligationMatches(
        obligation,
        target.obligationKind,
        target.obligation
      )
    ) ||
    definition.review.status !== "reviewed" ||
    assessment.measurements.status !== "measured"
  ) {
    throw new Error(
      "Interface preparation requires a reviewed concrete avoidable caller obligation and complete representative scenarios"
    );
  }

  if (input.transformation || input.guardrails.length) {
    throw new Error(
      "Interface reshaping and graph guardrails require separately supported preparation; seam safety remains unmeasured"
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
    !input.files.some((file) => definition.module.members.includes(file)) ||
    !input.files.some(
      (file) =>
        input.callers.includes(file) &&
        !definition.module.members.includes(file)
    ) ||
    definition.scenarios.some((entry) =>
      entry.evidence.some(
        (file) => !input.files.includes(file) && !input.callers.includes(file)
      )
    )
  ) {
    throw new Error(
      "Interface preparation must freeze existing module implementation, affected callers and every representative scenario"
    );
  }

  assertExerciseClean(root, [...input.files, ...input.callers]);
  const targetBaseline = exerciseTargetCount(assessment, target);

  if (targetBaseline <= target.goal) {
    throw new Error(
      "Interface target requires an existing avoidable caller obligation"
    );
  }

  const command = host.config().testCommand;

  if (!command) {
    throw new Error("An existing behavioural test command is required");
  }

  return { assessment, command, guardrails: [], inventory, targetBaseline };
}

export function assessInterfaceExercise(
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
      "Accepted semantic review and exact-source interface assessment are required"
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
      "Reviewed interface assessment must describe this exact current candidate source"
    );
  }

  if (
    before.dimension !== "interface-leverage" ||
    current.dimension !== "interface-leverage" ||
    target.kind !== "interface-leverage"
  ) {
    throw new Error("Interface target requires comparable interface evidence");
  }

  assertInterfaceInventory(
    before,
    current,
    target.obligationKind,
    target.obligation
  );

  if (
    after.measurements.status !== "measured" ||
    current.review.status !== "reviewed"
  ) {
    throw new Error(
      "Interface semantic evidence must remain complete and reviewed"
    );
  }

  if (
    !changedFiles.some((file) => before.module.members.includes(file)) ||
    !changedFiles.some(
      (file) =>
        preparation.input.callers.includes(file) &&
        !before.module.members.includes(file)
    )
  ) {
    throw new Error(
      "Actual module ownership and affected caller source must both change; hiding or shifting orchestration alone cannot qualify"
    );
  }

  if (input.semanticReview.trustBoundaries.length) {
    throw new Error(
      "Interface validation is reviewed through frozen invariants and unchanged positive/negative checks, not invented policy-site identities"
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

function assertInterfaceInventory(
  before: InterfaceAssessmentInput,
  after: InterfaceAssessmentInput,
  kind: CallerObligation["kind"],
  description: string
): void {
  if (
    JSON.stringify(before.module) !== JSON.stringify(after.module) ||
    before.scenarios.length !== after.scenarios.length
  ) {
    throw new Error(
      "Original logical module/interface and representative caller scenario inventory must remain frozen"
    );
  }

  for (const original of before.scenarios) {
    const candidate = after.scenarios.find((entry) => entry.id === original.id);

    if (
      !candidate ||
      candidate.description !== original.description ||
      JSON.stringify(candidate.evidence) !== JSON.stringify(original.evidence)
    ) {
      throw new Error(
        "Original representative scenario identities, questions and caller evidence cannot change or disappear"
      );
    }

    const retained = original.obligations.filter(
      (obligation) => !interfaceObligationMatches(obligation, kind, description)
    );

    if (JSON.stringify(candidate.obligations) !== JSON.stringify(retained)) {
      throw new Error(
        "Only the selected avoidable obligation may disappear; domain choices, unrelated obligations and caller inventories cannot be deleted, renamed or shifted"
      );
    }
  }
}
