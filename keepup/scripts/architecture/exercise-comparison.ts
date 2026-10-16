import type {
  ArchitectureExercise,
  ExerciseAttempt,
} from "./exercise-domain.ts";
import { preparationProjection } from "./exercise-transformation.ts";

export function exerciseComparison(
  context: ArchitectureExercise,
  attempt: ExerciseAttempt
): string {
  const mapping = context.preparation.input.transformation;
  const expected = mapping ? preparationProjection(context.preparation) : null;
  const after = attempt.assessment;

  const complete =
    after?.analysis &&
    "status" in after.analysis &&
    after.analysis.status === "complete";

  const comparable = Boolean(
    complete && (!expected || attempt.mapping?.digest === expected.digest)
  );

  return JSON.stringify(
    {
      advisory: attempt.advisory,
      after,
      before: context.preparation.assessment,
      comparable,
      errors: attempt.errors,
      guardrails: attempt.guardrails,
      learningState: context.state,
      mapping: mapping ?? null,
      mappingDigest: expected?.digest ?? null,
      method: expected
        ? "explicit-reviewed-transformation-preserving-original-logical-policies"
        : "unchanged-existing-file-policies",
      objectiveStatus: attempt.status,
      practiceFiles: attempt.changedFiles,
      schemaVersion: 1,
      target: attempt.target,
      touchedFiles: attempt.touchedFiles ?? attempt.changedFiles,
      tracking: attempt.tracking ?? true,
    },
    null,
    2
  );
}
