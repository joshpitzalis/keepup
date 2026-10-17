import type { CandidateChanges } from "./exercise-candidate.ts";
import type {
  ExerciseAssessmentInput,
  ExerciseInventory,
  ExercisePreparation,
} from "./exercise-domain.ts";
import { exerciseCommits } from "./exercise-evidence.ts";
import { suiteFiles } from "./exercise-tests.ts";
import { preparationProjection } from "./exercise-transformation.ts";
import { manifest } from "./storage.ts";

export function transformationChanges(
  root: string,
  preparation: ExercisePreparation,
  inventory: ExerciseInventory,
  input: ExerciseAssessmentInput
): CandidateChanges {
  const projection = preparationProjection(preparation);
  const { additions, removals } = projection.workingTree;

  const {
    manifest: before,
    revision: beforeRevision,
    untracked: beforeUntracked,
    sourceModes: beforeModes,
    indexModes: beforeIndexModes,
    ...beforeDefinitions
  } = preparation.inventory;

  const {
    manifest: tracked,
    revision: afterRevision,
    untracked,
    sourceModes: afterModes,
    indexModes: afterIndexModes,
    ...afterDefinitions
  } = inventory;

  if (JSON.stringify(beforeDefinitions) !== JSON.stringify(afterDefinitions)) {
    throw new Error(
      "Frozen transformation evaluator, host, test configuration or environment changed"
    );
  }

  if (
    JSON.stringify(beforeUntracked) !==
    JSON.stringify(untracked.filter((entry) => !additions.includes(entry.path)))
  ) {
    throw new Error(
      "Unexpected untracked or out-of-scope transformation source"
    );
  }

  const current = manifest(root, projection.workingTree);

  const expectedPaths = [
    ...before
      .map((entry) => entry.path)
      .filter((file) => !removals.includes(file)),
    ...additions,
  ].toSorted();

  if (
    JSON.stringify(current.map((entry) => entry.path)) !==
      JSON.stringify(expectedPaths) ||
    current.some((entry) => entry.hash === null)
  ) {
    throw new Error(
      "Unexpected addition/deletion, missing replacement or out-of-scope moved source; original rules cannot disappear"
    );
  }

  if (!beforeModes || !afterModes || !beforeIndexModes || !afterIndexModes) {
    throw new Error(
      "Transformation requires frozen source/index mode evidence from a fresh preparation"
    );
  }

  if (
    JSON.stringify(
      beforeModes.filter((entry) => !removals.includes(entry.path))
    ) !==
      JSON.stringify(
        afterModes.filter(
          (entry) =>
            !removals.includes(entry.path) && !additions.includes(entry.path)
        )
      ) ||
    afterModes.some(
      (entry) => additions.includes(entry.path) && entry.executable !== false
    ) ||
    JSON.stringify(
      beforeIndexModes.filter((entry) => !removals.includes(entry.path))
    ) !==
      JSON.stringify(
        afterIndexModes.filter(
          (entry) =>
            !removals.includes(entry.path) && !additions.includes(entry.path)
        )
      ) ||
    afterIndexModes.some(
      (entry) => additions.includes(entry.path) && entry.mode !== "100644"
    )
  ) {
    throw new Error(
      "Unexpected source/index mode change; mapping cannot change executable contracts"
    );
  }

  const oldHashes = new Map(before.map((entry) => [entry.path, entry.hash]));
  const hashes = new Map(current.map((entry) => [entry.path, entry.hash]));

  const touchedFiles = [...new Set([...oldHashes.keys(), ...hashes.keys()])]
    .filter((file) => oldHashes.get(file) !== hashes.get(file))
    .toSorted();

  const tests = suiteFiles(
    root,
    preparation.tests.command,
    preparation.input.requiredTests
  );

  const allowed = [...preparation.input.files, ...additions];

  if (
    !touchedFiles.length ||
    touchedFiles.some((file) => !allowed.includes(file) || tests.includes(file))
  ) {
    throw new Error(
      "Changed tests, undeclared guards or out-of-scope edits cannot be excused by a transformation"
    );
  }

  if (
    input.attribution.some((entry) => entry.author !== "learner") ||
    JSON.stringify(input.attribution.map((entry) => entry.file).toSorted()) !==
      JSON.stringify(touchedFiles)
  ) {
    throw new Error(
      "Actual learner attribution must cover every changed, new and deleted path; unresolved or agent work cannot grant practice"
    );
  }

  const changedFiles = touchedFiles.filter((file) => hashes.has(file));

  if (!changedFiles.length) {
    throw new Error(
      "Deletion alone supplies no attributable surviving work for practice"
    );
  }

  const commits = exerciseCommits(
    root,
    beforeRevision,
    afterRevision,
    allowed,
    tests,
    preparation.learner
  );

  const tracking =
    additions.every((file) =>
      tracked.some((entry) => entry.path === file && entry.hash !== null)
    ) &&
    removals.every((file) => !tracked.some((entry) => entry.path === file));

  return { changedFiles, commits, touchedFiles, tracking };
}
