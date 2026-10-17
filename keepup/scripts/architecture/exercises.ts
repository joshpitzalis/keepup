import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { exerciseComparison } from "./exercise-comparison.ts";
import type {
  ArchitectureExercise,
  ExerciseHost,
  ExerciseLifecycleInput,
  ExercisePreparation,
  ExercisePreparationInput,
  ExerciseStartInput,
} from "./exercise-domain.ts";
import {
  activeOrdinaryKata,
  assertExerciseClean,
  assertExerciseStable,
  EXERCISE_HOST_DIRECTORY,
  exerciseGuardrailCount,
  exerciseInventory,
  exerciseTargetCount,
  exerciseSeamAnalysis,
  linkedPreQuizzes,
  runExerciseTests,
} from "./exercise-evidence.ts";
import {
  parseExerciseLifecycle,
  parseExercisePreparation,
  parseExerciseStart,
} from "./exercise-parse.ts";
import {
  exerciseDirectory,
  exerciseIds,
  hasOpenArchitectureExercise,
  publishExerciseRecord,
  readExercise,
  readExercisePreparation,
  readExerciseAttempt,
} from "./exercise-storage.ts";
import {
  parseExerciseAssessment,
  parseExerciseCompletion,
} from "./exercise-submit-parse.ts";
import { assessExercise, completeExercise } from "./exercise-submit.ts";
import { validateTransformationPreparation } from "./exercise-transformation.ts";
import { writeArchitectureReport } from "./report.ts";
import { architectureDigest, archive, inspectAssessment } from "./storage.ts";

function assertAvailable(
  state: string,
  host: ExerciseHost,
  except: string | null = null
): void {
  if (
    activeOrdinaryKata(host.events()) ||
    hasOpenArchitectureExercise(state, except, host.events())
  ) {
    throw new Error(
      "An ordinary kata or architecture context is already active in this shared source tree; resume or explicitly abandon it first"
    );
  }
}

function assertOwner(owner: string, host: ExerciseHost): void {
  if (owner !== host.learner()) {
    throw new Error(
      "Exercise belongs to another learner; preserve its history and source"
    );
  }
}

interface CheckedPreparation extends Pick<
  ExercisePreparation,
  "assessment" | "inventory" | "targetBaseline" | "guardrails"
> {
  readonly command: string;
}

function validatePreparation(
  root: string,
  state: string,
  input: ExercisePreparationInput,
  host: ExerciseHost
): CheckedPreparation {
  const inspection = inspectAssessment(root, state, input.assessmentId);
  const { assessment } = inspection;
  const declaration = assessment.input;

  if (
    inspection.freshness.status !== "current" ||
    declaration.dimension !== "seam-integrity"
  ) {
    throw new Error(
      "Exercise requires a current complete deterministic seam finding, not a stale, partial or reviewed score"
    );
  }

  const analysis = exerciseSeamAnalysis(assessment);
  validateTransformationPreparation(root, input, declaration, host);
  const inventory = exerciseInventory(root, state);

  if (!inventory.revision) {
    throw new Error(
      "Commit the repository before preparing an architecture exercise"
    );
  }

  const currentScope = host.files();

  if (
    input.files.some((file) => !currentScope.includes(file)) ||
    input.callers.some(
      (file) =>
        !inventory.manifest.some(
          (entry) => entry.path === file && entry.hash !== null
        )
    )
  ) {
    throw new Error(
      "Architecture exercises initially require existing tracked files and callers; additions, deletions and membership changes require the later reshaping workflow"
    );
  }

  assertExerciseClean(root, input.files);
  const selected = input.target;

  if (selected.kind === "prohibited-cycle") {
    const group = analysis.cycles?.find(
      (candidate) =>
        candidate.policyId === selected.ruleId &&
        candidate.permittedBy === null &&
        JSON.stringify(candidate.modules) === JSON.stringify(selected.modules)
    );

    if (!group) {
      throw new Error(
        "Cycle target must name the complete reported prohibited module group"
      );
    }

    if (!group.path.some((step) => input.files.includes(step.edge.source))) {
      throw new Error(
        "Cycle repair scope must include an existing source edge in the reported cycle"
      );
    }
  } else {
    const findings = analysis.findings.filter(
      (finding) => finding.ruleId === selected.ruleId
    );

    if (
      !findings.some(
        (finding) =>
          finding.kind === selected.kind &&
          finding.source === selected.source &&
          finding.destination === selected.destination
      )
    ) {
      throw new Error(
        "Selected dependency finding is not present in the frozen assessment"
      );
    }

    if (findings.some((finding) => !input.files.includes(finding.source))) {
      throw new Error(
        "Repair scope must cover every violating source under the selected rule; endpoint rerouting cannot satisfy this rule-wide target"
      );
    }
  }

  const targetBaseline = exerciseTargetCount(assessment, selected);

  if (targetBaseline <= selected.goal) {
    throw new Error(
      "Exercise goal must strictly improve an available raw finding count"
    );
  }

  const guardrails = input.guardrails.map((guardrail) => {
    if (
      guardrail.kind === "prohibited-cycle"
        ? declaration.cycles?.id !== guardrail.ruleId
        : !declaration.rules.some((rule) => rule.id === guardrail.ruleId)
    ) {
      throw new Error(
        "Guardrail must reference an existing frozen dependency rule or cycle policy"
      );
    }

    return {
      ...guardrail,
      baseline: exerciseGuardrailCount(assessment, guardrail),
    };
  });

  const command = host.config().testCommand;

  if (!command) {
    throw new Error(
      "An existing behavioural test command is required before architecture exercise start"
    );
  }

  return { assessment, command, guardrails, inventory, targetBaseline };
}

export function prepareExercise(
  root: string,
  state: string,
  input: ExercisePreparationInput,
  host: ExerciseHost
): ExercisePreparation {
  return host.locked(() => {
    const path = join(exerciseDirectory(state, input.id), "prepare.json");
    const inputDigest = architectureDigest(JSON.stringify(input));

    if (existsSync(path)) {
      const previous = readExercisePreparation(state, input.id);
      assertOwner(previous.learner, host);

      if (previous.inputDigest !== inputDigest) {
        throw new Error("Exercise retry id already used with different input");
      }

      return previous;
    }

    assertAvailable(state, host);
    const checked = validatePreparation(root, state, input, host);
    const tests = runExerciseTests(root, checked.command, input.requiredTests);
    assertExerciseStable(root, state, checked.inventory);
    archive(root, state, checked.inventory.manifest);
    archive(import.meta.dirname, state, checked.inventory.assets);
    archive(EXERCISE_HOST_DIRECTORY, state, checked.inventory.hostAssets);
    assertExerciseStable(root, state, checked.inventory);

    const result: ExercisePreparation = {
      assessment: checked.assessment,
      guardrails: checked.guardrails,
      id: input.id,
      input,
      inputDigest,
      inventory: checked.inventory,
      learner: host.learner(),
      quizPrefix: `architecture:${input.id}:${randomUUID()}:pre:`,
      schemaVersion: 1,
      targetBaseline: checked.targetBaseline,
      tests,
      time: host.now(),
    };

    publishExerciseRecord(path, JSON.stringify(result));

    return readExercisePreparation(state, input.id);
  });
}

export function startExercise(
  root: string,
  state: string,
  input: ExerciseStartInput,
  host: ExerciseHost
): ArchitectureExercise {
  return host.locked(() => {
    const context = readExercise(state, input.exerciseId, host.events());
    const { preparation } = context;
    assertOwner(preparation.learner, host);
    const inputDigest = architectureDigest(JSON.stringify(input));

    if (context.start) {
      if (context.start.inputDigest !== inputDigest) {
        throw new Error(
          "Exercise start already recorded with a different retry payload"
        );
      }

      return context;
    }

    if (context.abandonment) {
      throw new Error(
        "Exercise context was abandoned; preserve its original baseline"
      );
    }

    assertAvailable(state, host, input.exerciseId);
    assertExerciseStable(root, state, preparation.inventory);
    assertExerciseClean(root, preparation.input.files);

    if (
      inspectAssessment(root, state, preparation.input.assessmentId).freshness
        .status !== "current"
    ) {
      throw new Error(
        "Exercise target definitions or analyser changed after the pre-quiz"
      );
    }

    const quizzes = linkedPreQuizzes(
      state,
      preparation,
      host.events(),
      input.preQuizIds
    );

    const tests = runExerciseTests(
      root,
      preparation.tests.command,
      preparation.input.requiredTests
    );

    assertExerciseStable(root, state, preparation.inventory);
    publishExerciseRecord(
      join(exerciseDirectory(state, input.exerciseId), "start.json"),
      JSON.stringify({
        input,
        inputDigest,
        learner: host.learner(),
        quizzes,
        schemaVersion: 1,
        tests,
        time: host.now(),
      })
    );

    return readExercise(state, input.exerciseId, host.events());
  });
}

export function exerciseLifecycle(
  state: string,
  type: "abandon" | "submission-pending",
  input: ExerciseLifecycleInput,
  host: ExerciseHost
): ArchitectureExercise {
  return host.locked(() => {
    const context = readExercise(state, input.exerciseId, host.events());
    assertOwner(context.preparation.learner, host);

    const path = join(
      exerciseDirectory(state, input.exerciseId),
      type === "abandon" ? "abandon.json" : `pending/${input.id}.json`
    );

    if (context.pass) {
      throw new Error("Exercise already passed; preserve accepted history");
    }

    if (context.abandonment && !existsSync(path)) {
      throw new Error("Exercise already abandoned");
    }

    if (type === "submission-pending" && !context.start) {
      throw new Error("Start the exercise before submitting learner work");
    }

    publishExerciseRecord(
      path,
      JSON.stringify({
        input,
        inputDigest: architectureDigest(JSON.stringify(input)),
        learner: host.learner(),
        schemaVersion: 1,
        time: host.now(),
        type,
      })
    );

    return readExercise(state, input.exerciseId, host.events());
  });
}

export function exerciseText(context: ArchitectureExercise): string {
  const { preparation } = context;

  return [
    `Architecture exercise ${preparation.id}: ${context.state}`,
    `Technique: ${preparation.input.technique}`,
    `Behaviour: ${preparation.input.behaviour}`,
    `Files: ${preparation.input.files.join(", ")}`,
    `Callers: ${preparation.input.callers.join(", ")}`,
    `Raw target (entire frozen rule; cycle groups intersect original subjects): ${preparation.targetBaseline} → ${preparation.input.target.goal}; ${JSON.stringify(preparation.input.target)}`,
    `Existing test command: ${preparation.tests.command}`,
    `Invariants: ${preparation.input.invariants.join("; ")}`,
    `Required existing file/name checks: ${JSON.stringify(preparation.input.requiredTests)}`,
    `Selected structural guardrails: ${JSON.stringify(preparation.guardrails)}`,
    `Anticipated tradeoffs: ${preparation.input.tradeoffs.join("; ") || "none declared"}`,
    `Stop condition: ${preparation.input.stopCondition}`,
    ...(preparation.input.transformation
      ? [
          `Frozen reviewed transformation and logical policy mapping: ${JSON.stringify(preparation.input.transformation)}`,
          "New implementation is assessable before tracking. Completion requires learner-staged additions/removals and a fresh stable assessment; practice does not transfer historical verification.",
        ]
      : []),
    ...context.attempts.map(
      (attempt) =>
        `Captured objective comparison ${attempt.input.id}: ${exerciseComparison(context, attempt)}`
    ),
    "The learner writes all code. Ask for a conceptual hint, explicitly abandon, or submit when ready. Run assess for immutable objective checks; after success collect actual post answers, explain-back and invariant review, then complete. Only accepted practice closes the exercise; delayed verification is separate.",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function compareExerciseCommand(
  state: string,
  args: readonly string[],
  host: ExerciseHost
): string {
  const [, id, attemptId] = args;

  if (!id || !attemptId) {
    throw new Error(
      "Exercise compare requires an exercise id and captured attempt id"
    );
  }

  return exerciseComparison(
    readExercise(state, id, host.events()),
    readExerciseAttempt(state, id, attemptId)
  );
}

export function exerciseCommand(
  root: string,
  state: string,
  args: readonly string[],
  host: ExerciseHost
): string {
  const [command, value] = args;

  if (command === "compare") {
    return compareExerciseCommand(state, args, host);
  }

  if (command === "assess") {
    return JSON.stringify(
      assessExercise(
        root,
        state,
        parseExerciseAssessment(JSON.parse(value ?? "")),
        host
      )
    );
  }

  if (command === "complete") {
    return JSON.stringify(
      completeExercise(
        root,
        state,
        parseExerciseCompletion(JSON.parse(value ?? "")),
        host
      )
    );
  }

  if (command === "prepare") {
    return JSON.stringify(
      prepareExercise(
        root,
        state,
        parseExercisePreparation(JSON.parse(value ?? "")),
        host
      )
    );
  }

  if (command === "start") {
    return JSON.stringify(
      startExercise(
        root,
        state,
        parseExerciseStart(JSON.parse(value ?? "")),
        host
      )
    );
  }

  if (command === "abandon" || command === "submit") {
    return JSON.stringify(
      exerciseLifecycle(
        state,
        command === "abandon" ? "abandon" : "submission-pending",
        parseExerciseLifecycle(JSON.parse(value ?? "")),
        host
      )
    );
  }

  if (command === "list") {
    return JSON.stringify(
      exerciseIds(state).map((id) => readExercise(state, id, host.events()))
    );
  }

  if ((command === "inspect" || command === "report") && value) {
    const context = readExercise(state, value, host.events());

    if (command === "report") {
      return JSON.stringify(
        writeArchitectureReport(
          state,
          `exercise-${context.preparation.id}`,
          "Architecture exercise",
          exerciseText(context),
          JSON.stringify(context, null, 2),
          !args.includes("--no-open"),
          [
            context.preparation.assessment,
            ...context.attempts.flatMap((attempt) =>
              attempt.assessment ? [attempt.assessment] : []
            ),
          ]
        )
      );
    }

    return args.includes("--json")
      ? JSON.stringify(context)
      : exerciseText(context);
  }

  throw new Error(
    "Usage: up architecture exercise prepare <json> | start <json> | inspect <id> [--json] | report <id> [--no-open] | compare <id> <attemptId> | list | abandon <json> | submit <json> | assess <json> | complete <json>"
  );
}
