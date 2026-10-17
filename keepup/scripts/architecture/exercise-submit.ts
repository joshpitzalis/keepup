import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { StoredEvent } from "../keepup.ts";
import { analyserToolChanged } from "./analyser.ts";
import { exerciseAdvisory } from "./exercise-advisory.ts";
import {
  assertCandidateStable,
  candidateChanges,
  exerciseIndexHash,
} from "./exercise-candidate.ts";
import type {
  ArchitectureExercise,
  ExerciseAcceptance,
  ExerciseAssessmentInput,
  ExerciseAttempt,
  ExerciseCompletionInput,
  ExerciseHost,
  ExercisePreparation,
} from "./exercise-domain.ts";
import {
  exerciseGuardrailCount,
  exerciseInventory,
  exerciseSeamAnalysis,
  exerciseTargetCount,
  runExerciseTests,
} from "./exercise-evidence.ts";
import {
  assessGraphGuardrails,
  assertSupportingGraphTools,
} from "./exercise-graph-guardrails.ts";
import { assessInterfaceExercise } from "./exercise-interface.ts";
import { assessNavigationExercise } from "./exercise-navigation.ts";
import { reviewedExerciseAssessment } from "./exercise-reviewed.ts";
import {
  exerciseDirectory,
  publishExerciseRecord,
  readExercise,
  readExerciseAcceptance,
  readExerciseAttempt,
} from "./exercise-storage.ts";
import { assessTestabilityExercise } from "./exercise-testability.ts";
import {
  mappedConcepts,
  preparationProjection,
} from "./exercise-transformation.ts";
import { analyseSeams } from "./seams.ts";
import { architectureDigest, recordAssessment } from "./storage.ts";

function ownedContext(
  state: string,
  id: string,
  host: ExerciseHost
): ArchitectureExercise {
  const context = readExercise(state, id, host.events());

  if (context.preparation.learner !== host.learner()) {
    throw new Error("Exercise belongs to another learner");
  }

  if (!context.start || context.abandonment) {
    throw new Error(
      "A started, non-abandoned architecture exercise is required"
    );
  }

  return context;
}

function evaluateExercise(
  root: string,
  state: string,
  preparation: ExercisePreparation,
  id: string
): NonNullable<ExerciseAttempt["assessment"]> {
  if (preparation.assessment.input.dimension !== "seam-integrity") {
    throw new Error("Unsupported exercise target dimension");
  }

  const original = preparation.assessment.input;

  const projection = preparation.input.transformation
    ? preparationProjection(preparation)
    : null;

  const evidence = [
    ...new Set(
      original.evidence.flatMap(
        (file) =>
          preparation.input.transformation?.files.find((group) =>
            group.before.includes(file)
          )?.after ?? [file]
      )
    ),
  ].toSorted();

  const definition = projection
    ? { ...original, evidence, id, modules: projection.modules }
    : { ...original, id };

  return recordAssessment(
    root,
    state,
    definition,
    (candidate) =>
      analyseSeams(
        root,
        candidate,
        process.env.KEEPUP_ANALYSER_DIRECTORY,
        projection?.workingTree
      ),
    projection?.workingTree
  );
}

function evaluateReviewedExercise(
  root: string,
  state: string,
  preparation: ExercisePreparation,
  input: ExerciseAssessmentInput,
  changedFiles: readonly string[]
): NonNullable<ExerciseAttempt["assessment"]> {
  if (preparation.input.target.kind === "navigability") {
    return assessNavigationExercise(
      root,
      state,
      preparation,
      input,
      changedFiles
    );
  }

  const evaluator =
    preparation.input.target.kind === "interface-leverage"
      ? assessInterfaceExercise
      : reviewedExerciseAssessment;

  return evaluator(root, state, preparation, input, changedFiles);
}

export function assessExercise(
  root: string,
  state: string,
  input: ExerciseAssessmentInput,
  host: ExerciseHost
): ExerciseAttempt {
  return host.locked(() => {
    const context = ownedContext(state, input.exerciseId, host);
    const inputDigest = architectureDigest(JSON.stringify(input));

    const path = join(
      exerciseDirectory(state, input.exerciseId),
      "attempts",
      `${input.id}.json`
    );

    if (existsSync(path)) {
      const previous = readExerciseAttempt(state, input.exerciseId, input.id);

      if (previous.inputDigest !== inputDigest) {
        throw new Error("Attempt retry id already used with different input");
      }

      return previous;
    }

    if (context.pass) {
      throw new Error(
        "Exercise already passed; preserve accepted history and prepare a new context for further work"
      );
    }

    const { preparation } = context;
    const inventory = exerciseInventory(root, state);
    const indexHash = exerciseIndexHash(root);
    let changedFiles: readonly string[] = [];
    let touchedFiles: readonly string[] = [];
    let tracking = false;
    let commits: readonly string[] = [];
    let tests: ExerciseAttempt["tests"] = null;
    let additionalTests: ExerciseAttempt["additionalTests"];
    let supportingAssessments: ExerciseAttempt["supportingAssessments"];
    let assessment: ExerciseAttempt["assessment"] = null;
    let current: number | null = null;
    let guardrails: ExerciseAttempt["guardrails"] = [];
    const errors: string[] = [];

    try {
      const changes = candidateChanges(root, preparation, inventory, input);

      ({ changedFiles, commits } = changes);
      touchedFiles = changes.touchedFiles ?? changedFiles;
      tracking = changes.tracking ?? true;
      tests = runExerciseTests(
        root,
        preparation.tests.command,
        preparation.input.requiredTests
      );
      assertCandidateStable(root, state, inventory, indexHash);

      if (preparation.input.target.kind === "behavioural-testability") {
        const result = assessTestabilityExercise(
          root,
          state,
          preparation,
          input,
          changedFiles
        );

        ({ assessment } = result);
        additionalTests = result.tests;
        current = exerciseTargetCount(assessment, preparation.input.target);
      } else if (
        ["interface-leverage", "change-locality", "navigability"].includes(
          preparation.input.target.kind
        )
      ) {
        assessment = evaluateReviewedExercise(
          root,
          state,
          preparation,
          input,
          changedFiles
        );
        current = exerciseTargetCount(assessment, preparation.input.target);
      } else {
        assessment = evaluateExercise(
          root,
          state,
          preparation,
          `exercise-${architectureDigest(JSON.stringify({ indexHash, input, inventory })).slice(0, 40)}`
        );
        const before = exerciseSeamAnalysis(preparation.assessment);
        const after = exerciseSeamAnalysis(assessment);

        if (
          !before.tool ||
          !after.tool ||
          before.tool.fingerprint !== after.tool.fingerprint
        ) {
          throw new Error(
            "Frozen analyser definitions changed; fresh preparation is required"
          );
        }

        current = exerciseTargetCount(assessment, preparation.input.target);

        const currentAssessment = assessment;
        guardrails = preparation.guardrails.map((guardrail) => ({
          ...guardrail,
          current: exerciseGuardrailCount(currentAssessment, guardrail),
        }));

        for (const guardrail of guardrails) {
          if (guardrail.current > guardrail.baseline) {
            errors.push(
              `Selected structural guardrail ${guardrail.ruleId}/${guardrail.kind} regressed`
            );
          }
        }

        if (after.tool && analyserToolChanged(after.tool)) {
          throw new Error("Analyser assets changed after objective evaluation");
        }
      }

      const graph = assessGraphGuardrails(
        root,
        state,
        preparation,
        input.id,
        guardrails
      );

      ({ guardrails } = graph);
      supportingAssessments = graph.assessments;
      errors.push(...graph.errors);

      if (
        current >= preparation.targetBaseline ||
        current > preparation.input.target.goal
      ) {
        errors.push(
          "The same frozen raw target did not improve and reach its goal"
        );
      }

      assertCandidateStable(root, state, inventory, indexHash);
    } catch (error) {
      errors.push(exerciseError(error));
    }

    let result: ExerciseAttempt = {
      advisory: exerciseAdvisory(root, state, preparation.inventory, inventory),
      assessment,
      changedFiles,
      commits,
      errors,
      guardrails,
      indexHash,
      input,
      inputDigest,
      inventory,
      learner: host.learner(),
      quizPrefix: `architecture:${input.exerciseId}:${input.id}:${randomUUID()}:post:`,
      schemaVersion: 1,
      status: errors.length ? "failed" : "awaiting-learning",
      target: {
        baseline: preparation.targetBaseline,
        current,
        goal: preparation.input.target.goal,
      },
      tests,
      time: host.now(),
    };

    result = withAttemptEvidence(
      result,
      additionalTests,
      supportingAssessments
    );

    if (preparation.input.transformation) {
      result = {
        ...result,
        mapping: {
          digest: preparationProjection(preparation).digest,
          originalAssessmentId: preparation.assessment.id,
        },
        touchedFiles,
        tracking,
      };
    }

    publishExerciseRecord(path, JSON.stringify(result));

    return readExerciseAttempt(state, input.exerciseId, input.id);
  });
}

function linkedPostEvidence(
  state: string,
  context: ArchitectureExercise,
  attempt: ExerciseAttempt,
  input: ExerciseCompletionInput,
  events: readonly StoredEvent[]
): Pick<ExerciseAcceptance, "postQuizzes" | "explanation"> {
  const postQuizzes = input.postQuizIds.map((id) => {
    const event = events.find(
      (candidate) => candidate.id === id && candidate.who === attempt.learner
    );

    if (
      !event ||
      event.type !== "quiz" ||
      event.phase !== "post" ||
      event.kataNumber !== undefined ||
      !event.id.startsWith(attempt.quizPrefix) ||
      Date.parse(event.t) < Date.parse(attempt.time) ||
      event.sha !== attempt.inventory.revision ||
      event.files.some(
        (file) =>
          !mappedConcepts(context.preparation).some(
            (concept) => concept.file === file
          )
      )
    ) {
      throw new Error(
        "Actual standalone post answers must belong to this learner, objective attempt, final HEAD and source"
      );
    }

    for (const file of event.files) {
      const hash = attempt.inventory.manifest.find(
        (entry) => entry.path === file
      )?.hash;

      if (
        !hash ||
        event.snapshots[file] !== hash ||
        architectureDigest(readFileSync(join(state, "snapshots", hash))) !==
          hash
      ) {
        throw new Error(
          "Post-quiz snapshots do not match assessed candidate bytes"
        );
      }
    }

    return event;
  });

  const answers = postQuizzes.flatMap((event) =>
    event.type === "quiz" ? event.answers : []
  );

  const concepts = answers
    .map((answer) =>
      JSON.stringify({ concept: answer.concept, file: answer.file })
    )
    .toSorted();

  const expected = mappedConcepts(context.preparation)
    .map((concept) => JSON.stringify(concept))
    .toSorted();

  const previous =
    context.start?.quizzes.flatMap((event) =>
      event.type === "quiz" ? event.answers : []
    ) ?? [];

  const normalize = (question: string) =>
    question.trim().replaceAll(/\s+/gu, " ").toLowerCase();

  if (
    JSON.stringify(concepts) !== JSON.stringify(expected) ||
    answers.some((answer) =>
      previous.some(
        (pre) => normalize(pre.question) === normalize(answer.question)
      )
    )
  ) {
    throw new Error(
      "Post answers must cover the exact original file/concepts with different actual questions; missing, reused or duplicate questions cannot count"
    );
  }

  const explanation = events.find(
    (event) => event.id === input.explainId && event.who === attempt.learner
  );

  if (
    !explanation ||
    explanation.type !== "explain" ||
    explanation.kataNumber !== undefined ||
    !explanation.id.startsWith(attempt.quizPrefix) ||
    explanation.sha !== attempt.inventory.revision ||
    Date.parse(explanation.t) <
      Math.max(
        Date.parse(attempt.time),
        ...postQuizzes.map((event) => Date.parse(event.t))
      ) ||
    JSON.stringify([...explanation.files].toSorted()) !==
      JSON.stringify([...attempt.changedFiles].toSorted())
  ) {
    throw new Error(
      "Actual standalone explain-back must follow this attempt's post answers at the final HEAD and cover attributable work"
    );
  }

  return { explanation, postQuizzes };
}

function assertInvariantReview(
  context: ArchitectureExercise,
  input: ExerciseCompletionInput
): void {
  const expected = [...context.preparation.input.invariants].toSorted();

  if (
    JSON.stringify(
      input.invariantReview.map((review) => review.invariant).toSorted()
    ) !== JSON.stringify(expected) ||
    input.invariantReview.some((review) => !review.preserved)
  ) {
    throw new Error(
      "Review every frozen invariant and removed/changed validation against the actual diff and existing tests; unresolved correctness cannot pass"
    );
  }
}

export function completeExercise(
  root: string,
  state: string,
  input: ExerciseCompletionInput,
  host: ExerciseHost
): ArchitectureExercise {
  return host.locked(() => {
    const context = ownedContext(state, input.exerciseId, host);
    const inputDigest = architectureDigest(JSON.stringify(input));
    const accepted = readExerciseAcceptance(state, input.exerciseId, input.id);

    if (accepted && accepted.inputDigest !== inputDigest) {
      throw new Error(
        "Exercise completion already has different immutable accepted input"
      );
    }

    if (context.pass) {
      if (
        !accepted ||
        context.pass.type !== "architecture_pass" ||
        context.pass.acceptanceId !== input.id
      ) {
        throw new Error(
          "Exercise already passed with a different immutable completion"
        );
      }

      return context;
    }

    const attempt = readExerciseAttempt(
      state,
      input.exerciseId,
      input.attemptId
    );

    if (
      attempt.status !== "awaiting-learning" ||
      attempt.learner !== host.learner()
    ) {
      throw new Error(
        "Objective checks must pass before actual post-quiz and explain-back"
      );
    }

    assertAttemptStable(root, state, attempt);
    assertTracking(context, attempt);
    assertReviewedLearningCoverage(context, attempt);
    assertInvariantReview(context, input);

    const learning = linkedPostEvidence(
      state,
      context,
      attempt,
      input,
      host.events()
    );

    if (!accepted) {
      const result: ExerciseAcceptance = {
        attempt,
        input,
        inputDigest,
        learner: host.learner(),
        schemaVersion: 1,
        time: host.now(),
        ...learning,
      };

      publishExerciseRecord(
        join(
          exerciseDirectory(state, input.exerciseId),
          "acceptances",
          `${input.id}.json`
        ),
        JSON.stringify(result)
      );
    }

    assertAttemptStable(root, state, attempt);

    if (!host.practice) {
      throw new Error(
        "Architecture practice requires the supported internal learning writer"
      );
    }

    host.practice(input.exerciseId, input.id);

    return readExercise(state, input.exerciseId, host.events());
  });
}

interface ArchitecturePracticeEvidence {
  readonly acceptanceId: string;
  readonly exerciseId: string;
  readonly attemptId: string;
  readonly evidenceDigest: string;
  readonly files: readonly string[];
}

export function assertAttemptStable(
  root: string,
  state: string,
  attempt: ExerciseAttempt
): void {
  assertSupportingGraphTools(attempt.supportingAssessments);

  const tool =
    attempt.assessment?.input.dimension === "seam-integrity"
      ? exerciseSeamAnalysis(attempt.assessment).tool
      : null;

  if (
    attempt.assessment?.input.dimension === "seam-integrity" &&
    (!tool || analyserToolChanged(tool))
  ) {
    throw new Error(
      "Accepted attempt's analyser assets are unavailable or changed; no practice can be issued"
    );
  }

  assertCandidateStable(root, state, attempt.inventory, attempt.indexHash);
}

export function acceptedPracticeEvidence(
  root: string,
  state: string,
  id: string,
  acceptanceId: string,
  learner: string,
  events: readonly StoredEvent[]
): ArchitecturePracticeEvidence {
  const context = readExercise(state, id, events);
  const accepted = readExerciseAcceptance(state, id, acceptanceId);

  if (
    !accepted ||
    !context.start ||
    context.abandonment ||
    accepted.learner !== learner ||
    context.preparation.learner !== learner ||
    accepted.attempt.status !== "awaiting-learning" ||
    !accepted.attempt.tests ||
    !accepted.attempt.assessment ||
    accepted.attempt.errors.length
  ) {
    throw new Error(
      "Internal practice requires owned, started, non-abandoned and objectively accepted immutable evidence"
    );
  }

  const { attempt } = accepted;
  assertAttemptStable(root, state, attempt);
  assertTracking(context, attempt);
  assertReviewedLearningCoverage(context, attempt);

  const changed = candidateChanges(
    root,
    context.preparation,
    attempt.inventory,
    attempt.input
  );

  if (
    JSON.stringify(changed.changedFiles) !==
    JSON.stringify(attempt.changedFiles)
  ) {
    throw new Error(
      "Accepted attribution does not match the immutable source manifest"
    );
  }

  assertInvariantReview(context, accepted.input);

  const learning = linkedPostEvidence(
    state,
    context,
    attempt,
    accepted.input,
    events
  );

  if (
    JSON.stringify(learning.postQuizzes) !==
      JSON.stringify(accepted.postQuizzes) ||
    JSON.stringify(learning.explanation) !==
      JSON.stringify(accepted.explanation)
  ) {
    throw new Error(
      "Accepted learner evidence no longer matches its supported event history"
    );
  }

  return {
    acceptanceId,
    attemptId: accepted.input.attemptId,
    evidenceDigest: architectureDigest(JSON.stringify(accepted)),
    exerciseId: id,
    files: attempt.changedFiles,
  };
}

function assertTracking(
  context: ArchitectureExercise,
  attempt: ExerciseAttempt
): void {
  if (
    context.preparation.input.transformation &&
    (!attempt.tracking ||
      attempt.mapping?.digest !==
        preparationProjection(context.preparation).digest)
  ) {
    throw new Error(
      "Reshaping completion requires learner-staged surviving/new source and staged removals, followed by a fresh assessment and actual mapped post evidence; the frozen mapping cannot change"
    );
  }
}

function assertReviewedLearningCoverage(
  context: ArchitectureExercise,
  attempt: ExerciseAttempt
): void {
  if (context.preparation.assessment.input.dimension === "seam-integrity") {
    return;
  }

  const concepts = mappedConcepts(context.preparation);

  if (
    attempt.changedFiles.some(
      (file) => !concepts.some((concept) => concept.file === file)
    )
  ) {
    throw new Error(
      "Every changed practice file requires its own frozen/mapped concept and actual linked pre/post learning evidence"
    );
  }
}

function withAttemptEvidence(
  attempt: ExerciseAttempt,
  tests: ExerciseAttempt["additionalTests"],
  supportingAssessments: ExerciseAttempt["supportingAssessments"]
): ExerciseAttempt {
  const result = tests ? { ...attempt, additionalTests: tests } : attempt;

  return supportingAssessments ? { ...result, supportingAssessments } : result;
}

/* oxlint-disable-next-line anti-slop/no-unknown-parameters -- An arbitrary caught error crosses the assessment boundary. */
function exerciseError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
