/* oxlint-disable anti-slop/no-unknown-parameters -- External JSON is reconstructed here before execution. */
import {
  object,
  parseArchitectureId,
  parseModule,
  strings,
  text,
} from "./parse-common.ts";
import type {
  CyclePolicy,
  CycleException,
  DependencyRule,
  SeamAssessmentInput,
} from "./seam-domain.ts";

function parseRule(value: unknown): DependencyRule {
  const source = object(value);
  const { kind, dependency } = source;

  if (kind !== "public-only" && kind !== "forbidden") {
    throw new Error("Dependency rule must be public-only or forbidden");
  }

  if (
    dependency !== "all" &&
    dependency !== "runtime" &&
    dependency !== "type-only"
  ) {
    throw new Error("Dependency policy must select all, runtime or type-only");
  }

  return {
    dependency,
    from: parseArchitectureId(source.from),
    id: parseArchitectureId(source.id),
    kind,
    to: parseArchitectureId(source.to),
  };
}

export function parseSeamAssessment(value: unknown): SeamAssessmentInput {
  const source = object(value);

  const allowed = new Set([
    "id",
    "dimension",
    "modules",
    "rules",
    "evidence",
    "exclusions",
    "limitations",
    "cycles",
  ]);

  if (
    source.dimension !== "seam-integrity" ||
    Object.keys(source).some((key) => !allowed.has(key)) ||
    !Array.isArray(source.modules) ||
    !Array.isArray(source.rules)
  ) {
    throw new Error(
      "Expected seam-integrity modules/rules; analyser metadata is CLI-owned"
    );
  }

  const modules = source.modules
    .map(parseModule)
    .toSorted((left, right) => left.id.localeCompare(right.id));

  const rules = source.rules
    .map(parseRule)
    .toSorted((left, right) => left.id.localeCompare(right.id));

  const ids = new Set(modules.map((module) => module.id));
  const members = modules.flatMap((module) => module.members);

  if (
    !modules.length ||
    ids.size !== modules.length ||
    new Set(members).size !== members.length ||
    new Set(rules.map((rule) => rule.id)).size !== rules.length ||
    rules.some(
      (rule) =>
        !ids.has(rule.from) || !ids.has(rule.to) || rule.from === rule.to
    )
  ) {
    throw new Error(
      "Seam modules/rules require unique identities, unambiguous membership and distinct declared endpoints"
    );
  }

  if (
    members.some(
      (file) =>
        !/\.(?:[cm]?[jt]sx?)$/u.test(file) ||
        file.startsWith("-") ||
        file.startsWith("/") ||
        file.split("/").includes("..")
    )
  ) {
    throw new Error(
      "Seam members must be repository-relative JavaScript/TypeScript source paths"
    );
  }

  const input: SeamAssessmentInput = {
    dimension: "seam-integrity",
    evidence: strings(source.evidence),
    exclusions: strings(source.exclusions),
    id: parseArchitectureId(source.id),
    limitations: strings(source.limitations),
    modules,
    rules,
  };

  if (source.cycles === undefined) {
    return input;
  }

  const cycles = parseCyclePolicy(source.cycles, ids);

  if (rules.some((rule) => rule.id === cycles.id)) {
    throw new Error("Cycle policy and dependency rule identities must differ");
  }

  return { ...input, cycles };
}

function parseCycleException(
  value: unknown,
  ids: ReadonlySet<string>
): CycleException {
  const source = object(value);
  const modules = strings(source.modules).map(parseArchitectureId).toSorted();

  if (
    modules.length < 2 ||
    new Set(modules).size !== modules.length ||
    modules.some((id) => !ids.has(id))
  ) {
    throw new Error(
      "Cycle exceptions require distinct declared modules (at least two)"
    );
  }

  return {
    id: parseArchitectureId(source.id),
    modules,
    reason: text(source.reason),
  };
}

function parseCyclePolicy(
  value: unknown,
  ids: ReadonlySet<string>
): CyclePolicy {
  const source = object(value);
  const { dependency } = source;

  if (
    (dependency !== "all" &&
      dependency !== "runtime" &&
      dependency !== "type-only") ||
    !Array.isArray(source.exceptions)
  ) {
    throw new Error(
      "Cycle policy requires dependency selection and explicit exceptions inventory"
    );
  }

  const exceptions = source.exceptions
    .map((entry) => parseCycleException(entry, ids))
    .toSorted((left, right) => left.id.localeCompare(right.id));

  if (
    new Set(exceptions.map((entry) => entry.id)).size !== exceptions.length ||
    new Set(exceptions.map((entry) => JSON.stringify(entry.modules))).size !==
      exceptions.length
  ) {
    throw new Error("Cycle exception identities/groups must be unique");
  }

  return { dependency, exceptions, id: parseArchitectureId(source.id) };
}
