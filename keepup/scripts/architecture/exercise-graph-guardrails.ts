import { analyserToolChanged } from "./analyser.ts";
import type { ArchitectureAssessment } from "./domain.ts";
import type {
  ExerciseInventory,
  ExercisePreparation,
  ExercisePreparationInput,
  ExerciseAttempt,
  ExerciseGuardrail,
} from "./exercise-domain.ts";
import {
  exerciseGuardrailCount,
  exerciseSeamAnalysis,
} from "./exercise-evidence.ts";
import type { SeamAssessmentInput } from "./seam-domain.ts";
import { analyseSeams } from "./seams.ts";
import {
  architectureDigest,
  inspectAssessment,
  manifest,
  readAssessment,
  recordAssessment,
} from "./storage.ts";

interface SupportingGraphPreparation {
  readonly assessments: readonly ArchitectureAssessment[];
  readonly guardrails: ExercisePreparation["guardrails"];
}

export function prepareGraphGuardrails(
  root: string,
  state: string,
  input: ExercisePreparationInput,
  inventory: ExerciseInventory,
  assessment: ArchitectureAssessment
): SupportingGraphPreparation | null {
  if (assessment.input.dimension === "seam-integrity") {
    if (
      input.guardrails.some((guardrail) => guardrail.assessmentId !== undefined)
    ) {
      throw new Error(
        "Seam targets retain guardrails from their original target assessment; supporting assessmentId is for reviewed targets only"
      );
    }

    return null;
  }

  if (!input.guardrails.length) {
    return null;
  }

  if (input.transformation) {
    throw new Error(
      "Selected graph guardrails with reviewed source transformations require separately supported logical graph mapping before preparation"
    );
  }

  const assessments = new Map<string, ArchitectureAssessment>();

  const guardrails = input.guardrails.map((guardrail) => {
    if (!guardrail.assessmentId) {
      throw new Error(
        "Reviewed graph guardrails require an explicit current complete supporting assessmentId"
      );
    }

    let supporting = assessments.get(guardrail.assessmentId);

    if (!supporting) {
      const inspection = inspectAssessment(root, state, guardrail.assessmentId);
      supporting = inspection.assessment;

      if (
        inspection.freshness.status !== "current" ||
        JSON.stringify(supporting.observation.manifest) !==
          JSON.stringify(inventory.manifest)
      ) {
        throw new Error(
          "Supporting graph guardrail assessment must be current for the exact prepared source"
        );
      }

      assertSupportingGraphTools([supporting]);
      assessments.set(guardrail.assessmentId, supporting);
    }

    const definition = supporting.input;

    if (definition.dimension !== "seam-integrity") {
      throw new Error(
        "Graph guardrails require deterministic seam policy definitions"
      );
    }

    assertApplicableGuardrail(definition, guardrail);

    return {
      ...guardrail,
      baseline: exerciseGuardrailCount(supporting, guardrail),
    };
  });

  return { assessments: [...assessments.values()], guardrails };
}

interface SupportingGraphAttempt {
  readonly assessments?: readonly ArchitectureAssessment[];
  readonly guardrails: ExerciseAttempt["guardrails"];
  readonly errors: readonly string[];
}

export function assessGraphGuardrails(
  root: string,
  state: string,
  preparation: ExercisePreparation,
  attemptId: string,
  previousGuardrails: ExerciseAttempt["guardrails"]
): SupportingGraphAttempt {
  const originals = preparation.supportingAssessments;

  if (!originals) {
    return { errors: [], guardrails: previousGuardrails };
  }

  assertSupportingGraphTools(originals);
  const source = manifest(root);

  const pairs = originals.map((original) => {
    if (original.input.dimension !== "seam-integrity") {
      throw new Error("Unsupported supporting graph definition");
    }

    const before = exerciseSeamAnalysis(original);

    const definition = {
      ...original.input,
      id: `exercise-graph-${architectureDigest(JSON.stringify({ attemptId, exerciseId: preparation.id, original: original.id, source })).slice(0, 40)}`,
    };

    const current = recordAssessment(root, state, definition, (candidate) =>
      analyseSeams(root, candidate, before.tool?.directory)
    );

    if (
      JSON.stringify(current.observation.manifest) !== JSON.stringify(source)
    ) {
      throw new Error(
        "Supporting graph execution does not match this exact candidate source"
      );
    }

    const after = exerciseSeamAnalysis(current);

    if (
      !before.tool ||
      !after.tool ||
      before.tool.fingerprint !== after.tool.fingerprint
    ) {
      throw new Error(
        "Supporting graph analyser definitions changed; fresh preparation is required"
      );
    }

    return { current, original };
  });

  const guardrails = preparation.guardrails.map((guardrail) => {
    const pair = pairs.find(
      (entry) => entry.original.id === guardrail.assessmentId
    );

    if (!pair) {
      throw new Error("Missing frozen supporting graph guardrail evidence");
    }

    return {
      ...guardrail,
      current: exerciseGuardrailCount(pair.current, guardrail),
    };
  });

  const assessments = pairs.map((pair) => pair.current);
  assertSupportingGraphTools(assessments);

  return {
    assessments,
    errors: guardrails
      .filter((guardrail) => guardrail.current > guardrail.baseline)
      .map(
        (guardrail) =>
          `Selected structural guardrail ${guardrail.ruleId}/${guardrail.kind} regressed`
      ),
    guardrails,
  };
}

export function assertSupportingGraphTools(
  assessments: readonly ArchitectureAssessment[] | undefined
): void {
  for (const assessment of assessments ?? []) {
    const { tool } = exerciseSeamAnalysis(assessment);

    if (!tool || analyserToolChanged(tool)) {
      throw new Error(
        "Supporting graph analyser assets are unavailable or changed; fresh preparation or assessment is required"
      );
    }
  }
}

export function verifySupportingGraphRecords(
  state: string,
  assessments: readonly ArchitectureAssessment[] | undefined
): void {
  for (const assessment of assessments ?? []) {
    if (
      JSON.stringify(readAssessment(state, assessment.id)) !==
      JSON.stringify(assessment)
    ) {
      throw new Error(
        "Supporting graph does not match its immutable recorded assessment"
      );
    }
  }
}

function assertApplicableGuardrail(
  definition: SeamAssessmentInput,
  guardrail: ExerciseGuardrail
): void {
  if (guardrail.kind === "prohibited-cycle") {
    if (definition.cycles?.id !== guardrail.ruleId) {
      throw new Error("Guardrail must name an existing frozen cycle policy");
    }

    return;
  }

  const rule = definition.rules.find((entry) => entry.id === guardrail.ruleId);

  if (
    !rule ||
    (guardrail.kind === "forbidden-direction"
      ? rule.kind !== "forbidden"
      : rule.kind !== "public-only")
  ) {
    throw new Error(
      "Guardrail finding kind must be applicable to the existing frozen supporting dependency rule"
    );
  }
}
