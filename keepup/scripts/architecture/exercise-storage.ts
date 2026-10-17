import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { StoredEvent } from "../keepup.ts";
import type {
  ArchitectureExercise,
  ExerciseLifecycle,
  ExercisePreparation,
  ExerciseStart,
  ExerciseAttempt,
  ExerciseAcceptance,
} from "./exercise-domain.ts";
import { verifySupportingGraphRecords } from "./exercise-graph-guardrails.ts";
import {
  parseExerciseLifecycle,
  parseExercisePreparation,
  parseExerciseStart,
} from "./exercise-parse.ts";
import {
  parseExerciseAssessment,
  parseExerciseCompletion,
} from "./exercise-submit-parse.ts";
import { parseArchitectureId } from "./parse-common.ts";
import {
  architectureDigest,
  atomicPublish,
  readAssessment,
  verifySnapshots,
} from "./storage.ts";

export function exerciseDirectory(state: string, id: string): string {
  return join(state, "architecture", "exercises", parseArchitectureId(id));
}

export function exerciseIds(state: string): readonly string[] {
  const directory = join(state, "architecture", "exercises");

  return existsSync(directory)
    ? readdirSync(directory)
        .filter((id) => existsSync(join(directory, id, "prepare.json")))
        .toSorted()
    : [];
}

/* oxlint-disable anti-slop/no-runtime-typeof -- Stored immutable exercise JSON is checked before exposing its source and learner context. */
function payload(path: string): string {
  const envelope = JSON.parse(readFileSync(path, "utf-8"));

  if (
    !envelope ||
    typeof envelope.payload !== "string" ||
    architectureDigest(envelope.payload) !== envelope.digest
  ) {
    throw new Error("Invalid architecture exercise record; left untouched");
  }

  return envelope.payload;
}

export function publishExerciseRecord(path: string, serialized: string): void {
  const result = JSON.parse(serialized);

  if (
    !atomicPublish(
      path,
      JSON.stringify({
        digest: architectureDigest(serialized),
        payload: serialized,
      })
    )
  ) {
    const previous = JSON.parse(payload(path));

    if (
      previous.inputDigest !== result.inputDigest ||
      previous.learner !== result.learner
    ) {
      throw new Error(
        "Exercise retry id already used with different input or learner"
      );
    }
  }
}

export function readExercisePreparation(
  state: string,
  id: string
): ExercisePreparation {
  const result = JSON.parse(
    payload(join(exerciseDirectory(state, id), "prepare.json"))
  );

  const input = parseExercisePreparation(result.input);

  if (
    result.schemaVersion !== 1 ||
    result.id !== id ||
    input.id !== id ||
    architectureDigest(JSON.stringify(input)) !== result.inputDigest ||
    typeof result.learner !== "string" ||
    !Number.isFinite(Date.parse(result.time)) ||
    typeof result.quizPrefix !== "string" ||
    !result.inventory ||
    typeof result.inventory.revision !== "string" ||
    !Array.isArray(result.inventory.manifest) ||
    !Array.isArray(result.inventory.assets) ||
    !Array.isArray(result.inventory.hostAssets)
  ) {
    throw new Error(
      "Invalid architecture exercise preparation; left untouched"
    );
  }

  verifySnapshots(state, [
    ...result.inventory.manifest,
    ...result.inventory.assets,
    ...result.inventory.hostAssets,
  ]);

  if (
    JSON.stringify(readAssessment(state, input.assessmentId)) !==
    JSON.stringify(result.assessment)
  ) {
    throw new Error(
      "Exercise baseline does not match its immutable assessment"
    );
  }

  verifySupportingGraphRecords(state, result.supportingAssessments);

  return result;
}

function readStart(state: string, id: string): ExerciseStart | null {
  const path = join(exerciseDirectory(state, id), "start.json");

  if (!existsSync(path)) {
    return null;
  }

  const result = JSON.parse(payload(path));
  const input = parseExerciseStart(result.input);

  if (
    result.schemaVersion !== 1 ||
    input.exerciseId !== id ||
    architectureDigest(JSON.stringify(input)) !== result.inputDigest ||
    typeof result.learner !== "string" ||
    !Number.isFinite(Date.parse(result.time)) ||
    !Array.isArray(result.quizzes)
  ) {
    throw new Error("Invalid exercise start; left untouched");
  }

  return result;
}

function readLifecycle(path: string, id: string): ExerciseLifecycle {
  const result = JSON.parse(payload(path));
  const input = parseExerciseLifecycle(result.input);

  if (
    result.schemaVersion !== 1 ||
    input.exerciseId !== id ||
    architectureDigest(JSON.stringify(input)) !== result.inputDigest ||
    (result.type !== "abandon" && result.type !== "submission-pending") ||
    typeof result.learner !== "string" ||
    !Number.isFinite(Date.parse(result.time))
  ) {
    throw new Error("Invalid exercise lifecycle; left untouched");
  }

  return result;
}

export function readExerciseAttempt(
  state: string,
  id: string,
  attemptId: string
): ExerciseAttempt {
  const result = JSON.parse(
    payload(
      join(
        exerciseDirectory(state, id),
        "attempts",
        `${parseArchitectureId(attemptId)}.json`
      )
    )
  );

  const input = parseExerciseAssessment(result.input);

  if (
    result.schemaVersion !== 1 ||
    input.exerciseId !== id ||
    input.id !== attemptId ||
    architectureDigest(JSON.stringify(input)) !== result.inputDigest ||
    (result.status !== "failed" && result.status !== "awaiting-learning") ||
    typeof result.learner !== "string" ||
    !Number.isFinite(Date.parse(result.time))
  ) {
    throw new Error("Invalid exercise attempt; left untouched");
  }

  verifySupportingGraphRecords(state, result.supportingAssessments);

  return result;
}

export function readExerciseAcceptance(
  state: string,
  id: string,
  acceptanceId: string
): ExerciseAcceptance | null {
  const path = join(
    exerciseDirectory(state, id),
    "acceptances",
    `${parseArchitectureId(acceptanceId)}.json`
  );

  if (!existsSync(path)) {
    return null;
  }

  const result = JSON.parse(payload(path));
  const input = parseExerciseCompletion(result.input);

  if (
    result.schemaVersion !== 1 ||
    input.exerciseId !== id ||
    input.id !== acceptanceId ||
    architectureDigest(JSON.stringify(input)) !== result.inputDigest ||
    typeof result.learner !== "string" ||
    !Number.isFinite(Date.parse(result.time)) ||
    JSON.stringify(result.attempt) !==
      JSON.stringify(readExerciseAttempt(state, id, input.attemptId))
  ) {
    throw new Error("Invalid accepted exercise evidence; left untouched");
  }

  return result;
}
/* oxlint-enable anti-slop/no-runtime-typeof */

export function readExercise(
  state: string,
  id: string,
  events: readonly StoredEvent[] = []
): ArchitectureExercise {
  const preparation = readExercisePreparation(state, id);
  const start = readStart(state, id);
  const directory = exerciseDirectory(state, id);

  const abandonment = existsSync(join(directory, "abandon.json"))
    ? readLifecycle(join(directory, "abandon.json"), id)
    : null;

  const submissionsDirectory = join(directory, "pending");

  const submissions = existsSync(submissionsDirectory)
    ? readdirSync(submissionsDirectory)
        .filter((name) => name.endsWith(".json"))
        .toSorted()
        .map((name) => readLifecycle(join(submissionsDirectory, name), id))
    : [];

  let stateName: ArchitectureExercise["state"] = "prepared";

  if (start) {
    stateName = "active";
  }

  if (submissions.length) {
    stateName = "submission-pending";
  }

  if (abandonment) {
    stateName = "abandoned";
  }

  const attemptsDirectory = join(directory, "attempts");

  const attempts = existsSync(attemptsDirectory)
    ? readdirSync(attemptsDirectory)
        .filter((name) => name.endsWith(".json"))
        .toSorted()
        .map((name) => readExerciseAttempt(state, id, name.slice(0, -5)))
    : [];

  const pass =
    events.find(
      (event) =>
        event.type === "architecture_pass" &&
        event.exerciseId === id &&
        event.who === preparation.learner
    ) ?? null;

  if (pass && pass.type === "architecture_pass") {
    const accepted = readExerciseAcceptance(state, id, pass.acceptanceId);

    if (
      !accepted ||
      pass.id !== `architecture:${id}:pass` ||
      pass.evidenceDigest !== architectureDigest(JSON.stringify(accepted)) ||
      pass.attemptId !== accepted.input.attemptId ||
      pass.sha !== accepted.attempt.inventory.revision ||
      JSON.stringify([...pass.files].toSorted()) !==
        JSON.stringify([...accepted.attempt.changedFiles].toSorted()) ||
      pass.files.some(
        (file) =>
          pass.snapshots[file] !==
          accepted.attempt.inventory.manifest.find(
            (entry) => entry.path === file
          )?.hash
      ) ||
      abandonment ||
      !start
    ) {
      throw new Error(
        "Architecture practice event lacks its immutable accepted exercise evidence"
      );
    }

    stateName = "passed";
  }

  return {
    abandonment,
    attempts,
    pass,
    preparation,
    start,
    state: stateName,
    submissions,
  };
}

export function hasOpenArchitectureExercise(
  state: string,
  excludingId: string | null = null,
  events: readonly StoredEvent[] = []
): boolean {
  return exerciseIds(state).some(
    (id) =>
      id !== excludingId &&
      !["abandoned", "passed"].includes(readExercise(state, id, events).state)
  );
}
