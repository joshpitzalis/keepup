import { spawnSync } from "node:child_process";

import type {
  ExerciseInventory,
  ExercisePreparation,
  ExerciseAssessmentInput,
} from "./exercise-domain.ts";
import { exerciseInventory } from "./exercise-evidence.ts";
import { suiteFiles } from "./exercise-tests.ts";
import { architectureDigest } from "./storage.ts";

export function exerciseGit(root: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf-8" });

  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || "Cannot establish candidate Git attribution"
    );
  }

  return result.stdout;
}

export function exerciseIndexHash(root: string): string {
  return architectureDigest(exerciseGit(root, "ls-files", "--stage", "-z"));
}

export function assertCandidateStable(
  root: string,
  state: string,
  inventory: ExerciseInventory,
  indexHash: string
): void {
  if (
    JSON.stringify(exerciseInventory(root, state)) !==
      JSON.stringify(inventory) ||
    exerciseIndexHash(root) !== indexHash
  ) {
    throw new Error(
      "Candidate source, HEAD, index, environment, tests or evaluator changed during assessment or learning evidence; assess a new attempt"
    );
  }
}

interface CandidateChanges {
  readonly changedFiles: readonly string[];
  readonly commits: readonly string[];
}

export function candidateChanges(
  root: string,
  preparation: ExercisePreparation,
  inventory: ExerciseInventory,
  input: ExerciseAssessmentInput
): CandidateChanges {
  const baseline = preparation.inventory;

  const {
    sourceModes: beforeSourceModes,
    indexModes: beforeIndexModes,
    revision: beforeRevision,
    manifest: beforeManifest,
    untracked: beforeUntracked,
    ...beforeDefinitions
  } = baseline;

  const {
    sourceModes: afterSourceModes,
    indexModes: afterIndexModes,
    revision: afterRevision,
    manifest: afterManifest,
    untracked: afterUntracked,
    ...afterDefinitions
  } = inventory;

  if (
    JSON.stringify(beforeSourceModes) !== JSON.stringify(afterSourceModes) ||
    JSON.stringify(beforeIndexModes) !== JSON.stringify(afterIndexModes)
  ) {
    throw new Error(
      "Tracked source or staged index modes changed after preparation; preserve edits and prepare a separate context"
    );
  }

  if (JSON.stringify(beforeDefinitions) !== JSON.stringify(afterDefinitions)) {
    throw new Error(
      "Frozen evaluator, host, configuration, runtime or environment definitions changed"
    );
  }

  if (JSON.stringify(beforeUntracked) !== JSON.stringify(afterUntracked)) {
    throw new Error(
      "Unexpected untracked inventory; existing-file exercises cannot add source paths"
    );
  }

  if (
    JSON.stringify(beforeManifest.map((entry) => entry.path)) !==
      JSON.stringify(afterManifest.map((entry) => entry.path)) ||
    afterManifest.some((entry) => entry.hash === null)
  ) {
    throw new Error(
      "Added, deleted or missing source paths require a separately prepared reshaping exercise"
    );
  }

  const changedFiles = afterManifest
    .filter((entry, index) => entry.hash !== beforeManifest[index]?.hash)
    .map((entry) => entry.path)
    .toSorted();

  if (!changedFiles.length) {
    throw new Error(
      "No attributable source improvement relative to the immutable baseline"
    );
  }

  const tests = suiteFiles(
    root,
    preparation.tests.command,
    preparation.input.requiredTests
  );

  if (
    changedFiles.some(
      (file) => !preparation.input.files.includes(file) || tests.includes(file)
    )
  ) {
    throw new Error(
      "Out-of-scope change or changed frozen behavioural test; preserve edits and prepare a separate exercise"
    );
  }

  if (
    input.attribution.some((entry) => entry.author !== "learner") ||
    JSON.stringify(input.attribution.map((entry) => entry.file).toSorted()) !==
      JSON.stringify(changedFiles)
  ) {
    throw new Error(
      "Unresolved or agent attribution cannot grant practice; obtain the learner's actual attribution for every changed file"
    );
  }

  if (!beforeRevision || !afterRevision) {
    throw new Error("Missing original or candidate commit identity");
  }

  exerciseGit(
    root,
    "merge-base",
    "--is-ancestor",
    beforeRevision,
    afterRevision
  );

  const commits = exerciseGit(
    root,
    "rev-list",
    "--reverse",
    `${beforeRevision}..${afterRevision}`
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  for (const commit of commits) {
    const parents = exerciseGit(root, "show", "-s", "--format=%P", commit)
      .trim()
      .split(" ");

    const authors = exerciseGit(
      root,
      "show",
      "-s",
      "--format=%ae%x00%ce",
      commit
    )
      .trim()
      .split("\0");

    const paths = exerciseGit(
      root,
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      commit
    )
      .split("\0")
      .filter(Boolean);

    if (
      parents.length !== 1 ||
      authors.some((email) => email !== preparation.learner) ||
      paths.some(
        (file) =>
          !preparation.input.files.includes(file) || tests.includes(file)
      )
    ) {
      throw new Error(
        "Unexpected commit: only linear learner-authored and learner-committed changes within the frozen existing-file scope are supported"
      );
    }
  }

  return { changedFiles, commits };
}
