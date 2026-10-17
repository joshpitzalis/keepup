import type {
  ExerciseGuardrail,
  ExerciseLifecycleInput,
  ExercisePreparationInput,
  ExerciseStartInput,
  ExerciseTarget,
} from "./exercise-domain.ts";
import { parseExerciseTransformation } from "./exercise-transformation-parse.ts";
import { object, parseArchitectureId, strings, text } from "./parse-common.ts";

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- Exercise command JSON is reconstructed at this boundary. */
function fields(
  value: unknown,
  allowed: readonly string[]
): Record<string, unknown> {
  const result = object(value);

  if (Object.keys(result).some((key) => !allowed.includes(key))) {
    throw new Error(
      "Unknown exercise field; baseline and provenance are CLI-owned"
    );
  }

  return result;
}

function uniqueStrings(value: unknown): readonly string[] {
  const result = strings(value);

  if (result.length !== new Set(result).size) {
    throw new Error("Exercise inventory entries must be unique");
  }

  return result;
}

function guardrail(value: unknown): ExerciseGuardrail {
  const input = fields(value, ["ruleId", "kind"]);
  const { kind } = input;

  if (
    kind !== "private-import" &&
    kind !== "forbidden-direction" &&
    kind !== "interface-reexport" &&
    kind !== "prohibited-cycle"
  ) {
    throw new Error("Expected deterministic seam finding kind");
  }

  return { kind, ruleId: parseArchitectureId(input.ruleId) };
}

function target(value: unknown): ExerciseTarget {
  const input = object(value);

  if (input.kind === "interface-leverage") {
    fields(input, [
      "kind",
      "scenarioId",
      "obligationKind",
      "obligation",
      "goal",
    ]);
    const { obligationKind } = input;

    if (
      input.goal !== 0 ||
      (obligationKind !== "operations" &&
        obligationKind !== "arguments" &&
        obligationKind !== "ordering" &&
        obligationKind !== "configuration" &&
        obligationKind !== "errors")
    ) {
      throw new Error(
        "Interface target requires a concrete caller obligation kind and zero remaining obligation goal"
      );
    }

    return {
      goal: 0,
      kind: "interface-leverage",
      obligation: text(input.obligation),
      obligationKind,
      scenarioId: parseArchitectureId(input.scenarioId),
    };
  }

  if (input.kind === "behavioural-testability") {
    fields(input, [
      "kind",
      "scenarioId",
      "goal",
      "command",
      "positive",
      "negative",
      "compatibility",
    ]);

    if (input.goal !== 0 || !Array.isArray(input.compatibility)) {
      throw new Error(
        "Testability requires zero remaining scenario gaps and explicit compatibility checks"
      );
    }

    const parseTest = (raw: unknown) => {
      const test = fields(raw, ["file", "name"]);

      return { file: text(test.file), name: text(test.name) };
    };

    return {
      command: text(input.command),
      compatibility: input.compatibility.map(parseTest),
      goal: 0,
      kind: "behavioural-testability",
      negative: parseTest(input.negative),
      positive: parseTest(input.positive),
      scenarioId: parseArchitectureId(input.scenarioId),
    };
  }

  if (input.kind === "change-locality") {
    fields(input, ["kind", "ruleId", "goal"]);

    if (input.goal !== 1) {
      throw new Error(
        "Locality target must consolidate to one authoritative policy site"
      );
    }

    return {
      goal: 1,
      kind: "change-locality",
      ruleId: parseArchitectureId(input.ruleId),
    };
  }

  if (input.goal !== 0) {
    throw new Error(
      "Initial architecture targets repair the selected finding completely: goal must be zero"
    );
  }

  if (input.kind === "prohibited-cycle") {
    fields(input, ["kind", "ruleId", "modules", "goal"]);

    const modules = uniqueStrings(input.modules)
      .map(parseArchitectureId)
      .toSorted();

    if (modules.length < 2) {
      throw new Error(
        "Cycle target requires its complete logical module group"
      );
    }

    return {
      goal: 0,
      kind: "prohibited-cycle",
      modules,
      ruleId: parseArchitectureId(input.ruleId),
    };
  }

  fields(input, ["kind", "ruleId", "source", "destination", "goal"]);
  const selected = guardrail({ kind: input.kind, ruleId: input.ruleId });

  if (selected.kind === "prohibited-cycle") {
    throw new Error("Cycle targets require module identities");
  }

  return {
    destination: text(input.destination),
    goal: 0,
    kind: selected.kind,
    ruleId: selected.ruleId,
    source: text(input.source),
  };
}

export function parseExercisePreparation(
  value: unknown
): ExercisePreparationInput {
  const input = fields(value, [
    "id",
    "assessmentId",
    "files",
    "callers",
    "technique",
    "behaviour",
    "target",
    "concepts",
    "invariants",
    "requiredTests",
    "guardrails",
    "tradeoffs",
    "stopCondition",
    "transformation",
  ]);

  if (
    !Array.isArray(input.concepts) ||
    !Array.isArray(input.guardrails) ||
    !Array.isArray(input.requiredTests)
  ) {
    throw new TypeError(
      "Exercise requires explicit concepts and guardrails inventories"
    );
  }

  const concepts = input.concepts.map((entry) => {
    const concept = fields(entry, ["file", "concept"]);

    return { concept: text(concept.concept), file: text(concept.file) };
  });

  const requiredTests = input.requiredTests.map((entry) => {
    const test = fields(entry, ["file", "name"]);

    return { file: text(test.file), name: text(test.name) };
  });

  if (!requiredTests.length) {
    throw new Error("Exercise requires named existing behavioural tests");
  }

  const files = uniqueStrings(input.files).toSorted();
  const invariants = uniqueStrings(input.invariants);

  if (
    !files.length ||
    !invariants.length ||
    concepts.length < 3 ||
    concepts.length > 5 ||
    new Set(concepts.map((concept) => JSON.stringify(concept))).size !==
      concepts.length ||
    concepts.some((concept) => !files.includes(concept.file))
  ) {
    throw new Error(
      "Exercise needs existing files, behavioural invariants and 3-5 distinct file/concepts for actual pre-quiz answers"
    );
  }

  const result: ExercisePreparationInput = {
    assessmentId: parseArchitectureId(input.assessmentId),
    behaviour: text(input.behaviour),
    callers: uniqueStrings(input.callers).toSorted(),
    concepts,
    files,
    guardrails: input.guardrails.map(guardrail),
    id: parseArchitectureId(input.id),
    invariants,
    requiredTests,
    stopCondition: text(input.stopCondition),
    target: target(input.target),
    technique: text(input.technique),
    tradeoffs: uniqueStrings(input.tradeoffs),
  };

  return input.transformation === undefined
    ? result
    : {
        ...result,
        transformation: parseExerciseTransformation(input.transformation),
      };
}

export function parseExerciseStart(value: unknown): ExerciseStartInput {
  const input = fields(value, ["id", "exerciseId", "preQuizIds"]);
  const preQuizIds = uniqueStrings(input.preQuizIds);

  if (!preQuizIds.length) {
    throw new Error(
      "Start requires linked actual pre-quiz events from the supported log writer"
    );
  }

  return {
    exerciseId: parseArchitectureId(input.exerciseId),
    id: parseArchitectureId(input.id),
    preQuizIds,
  };
}

export function parseExerciseLifecycle(value: unknown): ExerciseLifecycleInput {
  const input = fields(value, ["id", "exerciseId", "reason"]);

  return {
    exerciseId: parseArchitectureId(input.exerciseId),
    id: parseArchitectureId(input.id),
    reason: text(input.reason),
  };
}
