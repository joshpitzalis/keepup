import type { ExerciseTransformation } from "./exercise-domain.ts";
import {
  object,
  parseArchitectureId,
  parseModule,
  strings,
  text,
} from "./parse-common.ts";

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- Explicit reviewed transformation JSON is reconstructed here; never inferred from learner edits. */
function fields(
  value: unknown,
  allowed: readonly string[]
): Record<string, unknown> {
  const input = object(value);

  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new Error(
      "Unknown transformation field; original policy definitions cannot be rewritten"
    );
  }

  return input;
}

function unique(value: unknown): readonly string[] {
  const result = strings(value);

  if (new Set(result).size !== result.length) {
    throw new Error("Transformation inventories must be unique");
  }

  return result.toSorted();
}

function concept(
  value: unknown
): ExerciseTransformation["concepts"][number]["before"] {
  const input = fields(value, ["file", "concept"]);

  return { concept: text(input.concept), file: text(input.file) };
}

export function parseExerciseTransformation(
  value: unknown
): ExerciseTransformation {
  const input = fields(value, ["files", "modules", "concepts", "review"]);

  if (
    !Array.isArray(input.files) ||
    !Array.isArray(input.modules) ||
    !Array.isArray(input.concepts)
  ) {
    throw new TypeError(
      "Transformation requires explicit file, module and concept inventories"
    );
  }

  const review = fields(input.review, ["status", "reviewer", "notes"]);

  if (review.status !== "reviewed") {
    throw new Error(
      "Module splits/merges and file mappings require an explicit reviewed policy/behaviour rationale"
    );
  }

  const files = input.files.map((item) => {
    const file = fields(item, ["before", "after", "logicalModule"]);
    const before = unique(file.before);
    const after = unique(file.after);

    if (!after.length) {
      throw new Error(
        "Removed implementation requires an explicit surviving replacement; disappearance is not a repair"
      );
    }

    return {
      after,
      before,
      logicalModule: parseArchitectureId(file.logicalModule),
    };
  });

  const modules = input.modules.map((item) => {
    const module = fields(item, ["before", "after"]);

    if (!Array.isArray(module.after)) {
      throw new TypeError("Module mapping requires after modules");
    }

    const before = unique(module.before).map(parseArchitectureId);

    const after = module.after.map((entry) =>
      parseModule(fields(entry, ["id", "members", "interface"]))
    );

    if (!before.length || !after.length) {
      throw new Error("Module mappings cannot erase logical roles");
    }

    return { after, before };
  });

  const concepts = input.concepts.map((item) => {
    const entry = fields(item, ["before", "after"]);

    return { after: concept(entry.after), before: concept(entry.before) };
  });

  if (!files.length || !modules.length) {
    throw new Error(
      "Transformation must declare bounded files and complete module mappings"
    );
  }

  return {
    concepts,
    files,
    modules,
    review: {
      notes: text(review.notes),
      reviewer: text(review.reviewer),
      status: "reviewed",
    },
  };
}
/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type */
