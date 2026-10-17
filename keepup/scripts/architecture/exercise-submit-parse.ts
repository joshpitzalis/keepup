import type {
  ExerciseAssessmentInput,
  ExerciseCompletionInput,
  ExerciseSemanticReview,
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

function semanticReview(raw: unknown): ExerciseSemanticReview {
  const input = fields(raw, [
    "status",
    "reviewer",
    "rationale",
    "changes",
    "callers",
    "trustBoundaries",
  ]);

  if (
    (input.status !== "reviewed" && input.status !== "provisional") ||
    !Array.isArray(input.changes) ||
    !Array.isArray(input.callers) ||
    !Array.isArray(input.trustBoundaries)
  ) {
    throw new Error(
      "Semantic review requires explicit source, callers and trust-boundary inventories"
    );
  }

  return {
    callers: input.callers.map((value) => {
      const entry = fields(value, ["file", "excerpt", "rationale"]);

      return {
        excerpt: text(entry.excerpt),
        file: text(entry.file),
        rationale: text(entry.rationale),
      };
    }),
    changes: input.changes.map((value) => {
      const entry = fields(value, ["file", "before", "after", "rationale"]);

      return {
        after: text(entry.after),
        before: entry.before === null ? null : text(entry.before),
        file: text(entry.file),
        rationale: text(entry.rationale),
      };
    }),
    rationale: text(input.rationale),
    reviewer: text(input.reviewer),
    status: input.status,
    trustBoundaries: input.trustBoundaries.map((value) => {
      const entry = fields(value, ["siteId", "preserved", "evidence"]);

      if (typeof entry.preserved !== "boolean") {
        throw new TypeError(
          "Trust-boundary review requires explicit preservation"
        );
      }

      return {
        evidence: text(entry.evidence),
        preserved: entry.preserved,
        siteId: text(entry.siteId),
      };
    }),
  };
}

export function parseExerciseAssessment(
  value: unknown
): ExerciseAssessmentInput {
  const input = fields(value, [
    "id",
    "exerciseId",
    "reason",
    "attribution",
    "reviewedAssessmentId",
    "semanticReview",
  ]);

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

  let result: ExerciseAssessmentInput = {
    attribution: attribution.toSorted((a, b) => a.file.localeCompare(b.file)),
    exerciseId: parseArchitectureId(input.exerciseId),
    id: parseArchitectureId(input.id),
    reason: text(input.reason),
  };

  if (input.reviewedAssessmentId !== undefined) {
    result = {
      ...result,
      reviewedAssessmentId: parseArchitectureId(input.reviewedAssessmentId),
    };
  }

  if (input.semanticReview !== undefined) {
    result = {
      ...result,
      semanticReview: semanticReview(input.semanticReview),
    };
  }

  return result;
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
