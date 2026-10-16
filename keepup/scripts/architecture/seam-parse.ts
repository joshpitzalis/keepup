/* oxlint-disable anti-slop/no-unknown-parameters -- External JSON is reconstructed here before execution. */
import {
  object,
  parseArchitectureId,
  parseModule,
  strings,
} from "./parse-common.ts";
import type { DependencyRule, SeamAssessmentInput } from "./seam-domain.ts";

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

  return {
    dimension: "seam-integrity",
    evidence: strings(source.evidence),
    exclusions: strings(source.exclusions),
    id: parseArchitectureId(source.id),
    limitations: strings(source.limitations),
    modules,
    rules,
  };
}
