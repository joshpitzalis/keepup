import type {
  ExerciseAssessmentInput,
  ExerciseCompletionInput,
} from "./exercise-domain.ts";
import { object, parseArchitectureId, strings, text } from "./parse-common.ts";

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/no-runtime-typeof -- Submission JSON is reconstructed into explicit evidence contracts. */
function fields(
  value: unknown,
  allowed: readonly string[]
): Record<string, unknown> {
  const input = object(value);

  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new Error(
      "Unknown exercise submission field; objective results are CLI-owned"
    );
  }

  return input;
}

export function parseExerciseAssessment(
  value: unknown
): ExerciseAssessmentInput {
  const input = fields(value, ["id", "exerciseId", "reason", "attribution"]);

  if (!Array.isArray(input.attribution)) {
    throw new TypeError(
      "Actual learner attribution for every changed file is required"
    );
  }

  const attribution = input.attribution.map(
    (item): ExerciseAssessmentInput["attribution"][number] => {
      const entry = fields(item, ["file", "author"]);
      const { author } = entry;

      if (
        author !== "learner" &&
        author !== "agent" &&
        author !== "unresolved"
      ) {
        throw new Error(
          "Attribution author must be learner, agent or unresolved"
        );
      }

      return { author, file: text(entry.file) };
    }
  );

  if (
    !attribution.length ||
    new Set(attribution.map((entry) => entry.file)).size !== attribution.length
  ) {
    throw new Error("Attribution requires unique changed files");
  }

  return {
    attribution: attribution.toSorted((a, b) => a.file.localeCompare(b.file)),
    exerciseId: parseArchitectureId(input.exerciseId),
    id: parseArchitectureId(input.id),
    reason: text(input.reason),
  };
}

export function parseExerciseCompletion(
  value: unknown
): ExerciseCompletionInput {
  const input = fields(value, [
    "id",
    "exerciseId",
    "attemptId",
    "postQuizIds",
    "explainId",
    "invariantReview",
  ]);

  const postQuizIds = strings(input.postQuizIds);

  if (
    !postQuizIds.length ||
    new Set(postQuizIds).size !== postQuizIds.length ||
    !Array.isArray(input.invariantReview)
  ) {
    throw new Error(
      "Complete requires unique actual post-quiz IDs and explicit invariant review"
    );
  }

  const invariantReview = input.invariantReview.map((item) => {
    const entry = fields(item, ["invariant", "preserved", "evidence"]);

    if (typeof entry.preserved !== "boolean") {
      throw new TypeError(
        "Invariant review must explicitly confirm or reject preservation"
      );
    }

    return {
      evidence: text(entry.evidence),
      invariant: text(entry.invariant),
      preserved: entry.preserved,
    };
  });

  return {
    attemptId: parseArchitectureId(input.attemptId),
    exerciseId: parseArchitectureId(input.exerciseId),
    explainId: text(input.explainId),
    id: parseArchitectureId(input.id),
    invariantReview,
    postQuizIds,
  };
}
/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/no-runtime-typeof */
