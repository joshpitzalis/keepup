import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { isAbsolute, join, matchesGlob } from "node:path";

import type { ArchitectureModule, WorkingTreePaths } from "./domain.ts";
import type {
  ExerciseHost,
  ExercisePreparation,
  ExercisePreparationInput,
  ExerciseTransformation,
} from "./exercise-domain.ts";
import { suiteFiles } from "./exercise-tests.ts";
import type { SeamAssessmentInput } from "./seam-domain.ts";
import { architectureDigest } from "./storage.ts";

export interface TransformationProjection {
  readonly workingTree: WorkingTreePaths;
  readonly modules: readonly ArchitectureModule[];
  readonly roles: ReadonlyMap<
    string,
    { readonly logicalModule: string; readonly public: boolean }
  >;
  readonly digest: string;
}

function unique(entries: readonly string[], message: string): void {
  if (new Set(entries).size !== entries.length) {
    throw new Error(message);
  }
}

function sourcePath(root: string, file: string): void {
  const parts = file.split("/");

  if (
    !/\.(?:[cm]?[jt]sx?)$/u.test(file) ||
    isAbsolute(file) ||
    !/^[-a-zA-Z0-9_./]+$/u.test(file) ||
    file.startsWith("-") ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        [
          ".git",
          ".keepup",
          ".cogdebt",
          "node_modules",
          "dist",
          "build",
        ].includes(part)
    )
  ) {
    throw new Error(
      "Transformation paths must be finite normalized repository source paths within scope; generated/state/glob paths are unsupported"
    );
  }

  for (let index = 1; index <= parts.length; index += 1) {
    if (
      lstatSync(join(root, ...parts.slice(0, index)), {
        throwIfNoEntry: false,
      })?.isSymbolicLink()
    ) {
      throw new Error(`Symlinked transformation path is unsupported: ${file}`);
    }
  }
}

interface LogicalRole {
  readonly logicalModule: string;
  readonly public: boolean;
}

function applyFileMapping(
  group: ExerciseTransformation["files"][number],
  files: readonly string[],
  original: SeamAssessmentInput,
  originalRoles: ReadonlyMap<string, LogicalRole>,
  roles: Map<string, LogicalRole>
): void {
  if (
    !original.modules.some((module) => module.id === group.logicalModule) ||
    group.before.some(
      (file) =>
        !files.includes(file) ||
        originalRoles.get(file)?.logicalModule !== group.logicalModule
    )
  ) {
    throw new Error(
      "Every mapped old file must be an allowed existing member of one original logical policy role; cross-role single-file collapse is unsupported"
    );
  }

  const boundaries = new Set(
    group.before.map((file) => originalRoles.get(file)?.public)
  );

  if (boundaries.size > 1) {
    throw new Error(
      "Combining public and private policy roles into one file cannot prove the original file-edge constraint"
    );
  }

  const isPublic =
    group.before.length > 0 &&
    originalRoles.get(group.before[0] ?? "")?.public === true;

  if (isPublic && group.after.length > group.before.length) {
    throw new Error(
      "A transformation cannot expand the original logical public surface"
    );
  }

  for (const file of group.after) {
    const previous = originalRoles.get(file);

    if (
      roles.has(file) ||
      (previous &&
        (!group.before.includes(file) ||
          previous.logicalModule !== group.logicalModule ||
          previous.public !== isPublic))
    ) {
      throw new Error(
        "Transformation must preserve original private/public policy ownership; promoting a private member or merging different roles is unsupported"
      );
    }

    roles.set(file, { logicalModule: group.logicalModule, public: isPublic });
  }
}

export function projectTransformation(
  input: ExercisePreparationInput,
  original: SeamAssessmentInput
): TransformationProjection {
  const mapping = input.transformation;

  if (!mapping) {
    throw new Error("An explicit frozen transformation is required");
  }

  const beforePaths = mapping.files.flatMap((group) => group.before);
  const afterPaths = mapping.files.flatMap((group) => group.after);
  unique(
    beforePaths,
    "An old file may appear in only one transformation relation"
  );
  unique(
    afterPaths,
    "An after file cannot collapse multiple policy roles or appear in several relations"
  );

  const originalRoles = new Map(
    original.modules.flatMap((module) =>
      module.members.map(
        (file) =>
          [
            file,
            {
              logicalModule: module.id,
              public: module.interface.includes(file),
            },
          ] as const
      )
    )
  );

  const roles = new Map(
    [...originalRoles].filter(([file]) => !beforePaths.includes(file))
  );

  for (const group of mapping.files) {
    applyFileMapping(group, input.files, original, originalRoles, roles);
  }

  const mappedIds = mapping.modules.flatMap((group) => group.before).toSorted();

  if (
    JSON.stringify(mappedIds) !==
    JSON.stringify(original.modules.map((module) => module.id).toSorted())
  ) {
    throw new Error(
      "Reviewed module mappings must cover every original logical role exactly once"
    );
  }

  const physical = mapping.modules.flatMap((group) => group.after);
  unique(
    physical.map((module) => module.id),
    "Physical after-module identities must be unique"
  );
  const physicalPaths = physical.flatMap((module) => module.members).toSorted();
  unique(
    physicalPaths,
    "Every surviving source must have exactly one physical after owner"
  );

  if (
    JSON.stringify(physicalPaths) !==
    JSON.stringify([...roles.keys()].toSorted())
  ) {
    throw new Error(
      "Physical after modules must inventory all surviving original members, callers and declared new implementation"
    );
  }

  for (const group of mapping.modules) {
    if (
      group.after.some((module) =>
        module.members.some(
          (file) => !group.before.includes(roles.get(file)?.logicalModule ?? "")
        )
      )
    ) {
      throw new Error(
        "A physical split/merge cannot silently change a file's original logical policy obligations"
      );
    }
  }

  const expected = input.concepts
    .map((entry) => JSON.stringify(entry))
    .toSorted();

  if (
    JSON.stringify(
      mapping.concepts.map((entry) => JSON.stringify(entry.before)).toSorted()
    ) !== JSON.stringify(expected)
  ) {
    throw new Error(
      "Transformation must explicitly map every original quiz concept exactly once"
    );
  }

  const afterConcepts = mapping.concepts.map((entry) =>
    JSON.stringify(entry.after)
  );

  unique(
    afterConcepts,
    "Mapped concepts must remain distinct actual questions"
  );

  if (
    mapping.concepts.some(
      (entry) =>
        entry.before.concept !== entry.after.concept ||
        !roles.has(entry.after.file) ||
        (entry.before.file !== entry.after.file &&
          !mapping.files.some(
            (group) =>
              group.before.includes(entry.before.file) &&
              group.after.includes(entry.after.file)
          ))
    )
  ) {
    throw new Error(
      "Mapped quiz concepts must preserve original identity and follow the declared surviving file relation"
    );
  }

  const workingTree = {
    additions: afterPaths.filter((file) => !originalRoles.has(file)).toSorted(),
    removals: beforePaths.filter((file) => !roles.has(file)).toSorted(),
  };

  const modules = original.modules.map((module) => ({
    id: module.id,
    interface: [...roles]
      .flatMap(([file, role]) =>
        role.logicalModule === module.id && role.public ? [file] : []
      )
      .toSorted(),
    members: [...roles]
      .flatMap(([file, role]) =>
        role.logicalModule === module.id ? [file] : []
      )
      .toSorted(),
  }));

  if (
    modules.some((module) => !module.members.length || !module.interface.length)
  ) {
    throw new Error(
      "Transformation cannot erase an original logical module or its intended public contract"
    );
  }

  return {
    digest: architectureDigest(JSON.stringify(mapping)),
    modules,
    roles,
    workingTree,
  };
}

export function validateTransformationPreparation(
  root: string,
  input: ExercisePreparationInput,
  original: SeamAssessmentInput,
  host: ExerciseHost
): void {
  if (!input.transformation) {
    return;
  }

  const projected = projectTransformation(input, original);
  const config = host.config();

  if (!config.include || !config.exclude || !config.testCommand) {
    throw new Error(
      "Transformation requires the existing configured source scope and behaviour command"
    );
  }

  const tests = suiteFiles(root, config.testCommand, input.requiredTests);

  if (
    input.transformation.files.some(
      (group) =>
        group.before.some((file) => tests.includes(file)) ||
        group.after.some((file) => tests.includes(file))
    )
  ) {
    throw new Error(
      "Existing behavioural tests and required guards cannot be moved, deleted or replaced by a transformation"
    );
  }

  for (const file of [
    ...input.transformation.files.flatMap((group) => group.before),
    ...input.transformation.files.flatMap((group) => group.after),
  ]) {
    sourcePath(root, file);
  }

  for (const file of projected.workingTree.additions) {
    if (lstatSync(join(root, file), { throwIfNoEntry: false })) {
      throw new Error(
        "Planned new paths must not already exist, including ignored or untracked source"
      );
    }

    const ignored = spawnSync(
      "git",
      ["check-ignore", "--no-index", "-q", "--", file],
      { cwd: root }
    );

    if (
      ignored.status !== 1 ||
      !config.include.some((glob) => matchesGlob(file, glob)) ||
      config.exclude.some((glob) => matchesGlob(file, glob))
    ) {
      throw new Error(
        "Planned new path is ignored, generated or outside the configured source scope"
      );
    }
  }
}

export function preparationProjection(
  preparation: ExercisePreparation
): TransformationProjection {
  if (preparation.assessment.input.dimension !== "seam-integrity") {
    throw new Error(
      "Transformation requires the original deterministic seam policy"
    );
  }

  return projectTransformation(preparation.input, preparation.assessment.input);
}

export function mappedConcepts(
  preparation: ExercisePreparation
): ExercisePreparationInput["concepts"] {
  return (
    preparation.input.transformation?.concepts.map((entry) => entry.after) ??
    preparation.input.concepts
  );
}
