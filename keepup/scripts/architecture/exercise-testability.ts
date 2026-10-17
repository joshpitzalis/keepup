import type { ArchitectureAssessment } from "./domain.ts";
import type {
  ExerciseAssessmentInput,
  ExerciseHost,
  ExercisePreparation,
  ExercisePreparationInput,
  ExerciseTarget,
  ExerciseTestRun,
} from "./exercise-domain.ts";
import {
  assertExerciseClean,
  exerciseInventory,
  exerciseTargetCount,
} from "./exercise-evidence.ts";
import { assertReviewedSource } from "./exercise-reviewed.ts";
import { runExerciseTests, suiteFiles } from "./exercise-tests.ts";
import {
  preparationProjection,
  projectTransformation,
  validateTransformationPreparation,
} from "./exercise-transformation.ts";
import { inspectAssessment } from "./storage.ts";
import type {
  TestabilityAssessmentInput,
  TestabilityScenario,
} from "./testability.ts";

export function validateTestabilityPreparation(
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
  const before = assessment.input;

  if (
    target.kind !== "behavioural-testability" ||
    before.dimension !== "behavioural-testability"
  ) {
    throw new Error("Testability requires a current testability assessment");
  }

  const scenario = before.scenarios.find(
    (entry) => entry.id === target.scenarioId
  );

  if (
    !scenario ||
    before.discovery !== "complete" ||
    before.review.status !== "reviewed" ||
    assessment.measurements.status !== "measured" ||
    exerciseTargetCount(assessment, target) !== 1
  ) {
    throw new Error(
      "Testability requires a reviewed unsupported scenario and complete discovery"
    );
  }

  const command = host.config().testCommand;

  if (!command) {
    throw new Error("An existing regression command is required");
  }

  const regressions = suiteFiles(root, command, input.requiredTests);
  const original = { modules: [before.module] };
  validateTransformationPreparation(root, input, original, host);

  const projection = input.transformation
    ? projectTransformation(input, original)
    : null;

  const allowed = new Set([
    ...input.files,
    ...(projection?.workingTree.additions ?? []),
  ]);

  validateAdditionalTests(target, allowed, regressions);

  if (requiresCompatibility(scenario) && !target.compatibility.length) {
    throw new Error(
      "Required dependency compatibility checks must be prepared"
    );
  }

  const inventory = exerciseInventory(root, state);

  if (
    !inventory.revision ||
    !input.callers.length ||
    input.files.some((file) => !host.files().includes(file)) ||
    input.callers.some(
      (file) =>
        !inventory.manifest.some(
          (entry) => entry.path === file && entry.hash !== null
        )
    )
  ) {
    throw new Error(
      "Testability requires existing allowed source and caller scope"
    );
  }

  assertExerciseClean(root, [...input.files, ...input.callers]);

  return { assessment, command, guardrails: [], inventory, targetBaseline: 1 };
}

interface TestabilityExerciseEvidence {
  readonly assessment: ArchitectureAssessment;
  readonly tests: ExerciseTestRun;
}

export function assessTestabilityExercise(
  root: string,
  state: string,
  preparation: ExercisePreparation,
  input: ExerciseAssessmentInput,
  changedFiles: readonly string[]
): TestabilityExerciseEvidence {
  const { target } = preparation.input;
  const before = preparation.assessment.input;

  if (
    target.kind !== "behavioural-testability" ||
    before.dimension !== "behavioural-testability" ||
    !input.reviewedAssessmentId ||
    input.semanticReview?.status !== "reviewed"
  ) {
    throw new Error(
      "Testability requires accepted semantic review and exact-source assessment"
    );
  }

  const inspection = inspectAssessment(root, state, input.reviewedAssessmentId);
  const after = inspection.assessment;
  const current = after.input;

  if (
    current.dimension !== "behavioural-testability" ||
    inspection.freshness.status !== "current" ||
    JSON.stringify(after.observation.manifest) !==
      JSON.stringify(exerciseInventory(root, state).manifest)
  ) {
    throw new Error(
      "Reviewed testability assessment must describe the exact current candidate"
    );
  }

  const selected = before.scenarios.find(
    (entry) => entry.id === target.scenarioId
  );

  const candidate = current.scenarios.find(
    (entry) => entry.id === target.scenarioId
  );

  const expectedModule = preparation.input.transformation
    ? preparationProjection(preparation).modules[0]
    : before.module;

  if (
    !selected ||
    !candidate ||
    current.review.status !== "reviewed" ||
    current.discovery !== before.discovery ||
    JSON.stringify(current.module) !== JSON.stringify(expectedModule) ||
    JSON.stringify(current.environmentRequirements) !==
      JSON.stringify(before.environmentRequirements) ||
    JSON.stringify(before.scenarios.map((entry) => entry.id)) !==
      JSON.stringify(current.scenarios.map((entry) => entry.id))
  ) {
    throw new Error(
      "Frozen scenario inventory, module, discovery and environment cannot change"
    );
  }

  assertScenarioContract(before, current, target);

  if (
    after.measurements.status !== "measured" ||
    exerciseTargetCount(after, target) !== 0
  ) {
    throw new Error(
      "Reviewed observable outcomes through the intended interface, actual execution and required compatibility checks are necessary"
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

  const tests = runExerciseTests(root, target.command, [
    target.positive,
    target.negative,
    ...target.compatibility,
  ]);

  return { assessment: after, tests };
}

function validateAdditionalTests(
  target: Extract<ExerciseTarget, { kind: "behavioural-testability" }>,
  allowed: ReadonlySet<string>,
  regressions: readonly string[]
): void {
  const tests = [target.positive, target.negative, ...target.compatibility];
  const files = [...new Set(tests.map((entry) => entry.file))].toSorted();

  const [executable, flag, reporter, ...declared] =
    target.command.split(/\s+/u);

  if (
    (executable !== "node" && executable !== process.execPath) ||
    flag !== "--test" ||
    reporter !== "--test-reporter=tap" ||
    JSON.stringify(declared.toSorted()) !== JSON.stringify(files) ||
    new Set(declared).size !== declared.length ||
    new Set(tests.map((entry) => JSON.stringify(entry))).size !==
      tests.length ||
    tests.some(
      (entry) => !allowed.has(entry.file) || regressions.includes(entry.file)
    )
  ) {
    throw new Error(
      "Explicit additional positive, negative and compatibility tests must be distinct, within prepared scope and separate from frozen regression files"
    );
  }
}

function assertScenarioContract(
  before: TestabilityAssessmentInput,
  current: TestabilityAssessmentInput,
  target: Extract<ExerciseTarget, { kind: "behavioural-testability" }>
): void {
  const selected = before.scenarios.find(
    (entry) => entry.id === target.scenarioId
  );

  const candidate = current.scenarios.find(
    (entry) => entry.id === target.scenarioId
  );

  if (!selected || !candidate) {
    throw new Error("Frozen scenario missing");
  }

  for (const scenario of before.scenarios) {
    const next = current.scenarios.find((entry) => entry.id === scenario.id);

    if (!next) {
      throw new Error("Frozen scenario missing");
    }

    if (
      scenario.id !== target.scenarioId &&
      JSON.stringify(scenario) !== JSON.stringify(next)
    ) {
      throw new Error("Unselected scenarios must remain frozen");
    }
  }

  const {
    assertion: _originalAssertion,
    tests: _originalTests,
    compatibility: _originalCompatibility,
    ...originalContract
  } = selected;

  const {
    assertion: _assertion,
    tests: selectedTests,
    compatibility,
    ...candidateContract
  } = candidate;

  if (
    JSON.stringify(originalContract) !== JSON.stringify(candidateContract) ||
    JSON.stringify(selectedTests) !==
      JSON.stringify([target.positive, target.negative]) ||
    JSON.stringify(compatibility) !== JSON.stringify(target.compatibility)
  ) {
    throw new Error(
      "The same behaviour, failure invariant, intended interface, dependency strategy and prepared test identities must remain frozen"
    );
  }
}

function requiresCompatibility(scenario: TestabilityScenario): boolean {
  return (
    scenario.dependency.compatibilityRequired ||
    scenario.dependency.kind === "owned-remote" ||
    scenario.dependency.kind === "true-external"
  );
}
