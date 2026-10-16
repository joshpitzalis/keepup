import type {
  ArchitectureReview,
  AssessmentInput,
  CallerObligation,
  InterfaceScenario,
} from "./domain.ts";
import type {
  LocalityAssessmentInput,
  LocalityRule,
  PolicyChange,
  PolicySite,
} from "./locality.ts";
/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- This JSON trust boundary reconstructs every accepted field before any writes. */
import {
  object,
  text,
  strings,
  parseArchitectureId,
  parseModule,
} from "./parse-common.ts";
import { parseSeamAssessment } from "./seam-parse.ts";

export { parseArchitectureId, parseModule } from "./parse-common.ts";

export function parseReview(value: unknown): ArchitectureReview {
  const source = object(value);
  const { status, confidence } = source;

  if (status !== "reviewed" && status !== "provisional") {
    throw new Error("Review status must be reviewed or provisional");
  }

  if (
    confidence !== "low" &&
    confidence !== "medium" &&
    confidence !== "high"
  ) {
    throw new Error("Review confidence must be low, medium or high");
  }

  return {
    confidence,
    notes: text(source.notes),
    reviewer: text(source.reviewer),
    status,
  };
}

function parseObligation(value: unknown): CallerObligation {
  const source = object(value);
  const { kind, classification } = source;

  if (
    kind !== "operations" &&
    kind !== "arguments" &&
    kind !== "ordering" &&
    kind !== "configuration" &&
    kind !== "errors"
  ) {
    throw new Error("Unknown caller obligation kind");
  }

  if (classification !== "domain" && classification !== "avoidable") {
    throw new Error("Obligation classification must be domain or avoidable");
  }

  return {
    classification,
    description: text(source.description),
    evidence: strings(source.evidence),
    kind,
  };
}

function parseScenario(value: unknown): InterfaceScenario {
  const source = object(value);
  const { rating } = source;

  if (rating !== null && rating !== 0 && rating !== 0.5 && rating !== 1) {
    throw new Error("Scenario rating must be 0, 0.5, 1 or null");
  }

  if (!Array.isArray(source.obligations)) {
    throw new TypeError("Scenario requires caller obligations inventory");
  }

  return {
    description: text(source.description),
    evidence: strings(source.evidence),
    id: parseArchitectureId(source.id),
    obligations: source.obligations.map(parseObligation),
    rating,
    rationale: text(source.rationale),
  };
}

export function parseAssessment(value: unknown): AssessmentInput {
  const source = object(value);

  if (source.dimension === "change-locality") {
    return parseLocalityAssessment(source);
  }

  if (source.dimension === "seam-integrity") {
    return parseSeamAssessment(value);
  }

  if (
    source.dimension !== "interface-leverage" ||
    !Array.isArray(source.scenarios)
  ) {
    throw new Error(
      "Expected interface-leverage assessment with fixed scenarios inventory"
    );
  }

  const scenarios = source.scenarios.map(parseScenario);

  if (
    new Set(scenarios.map((scenario) => scenario.id)).size !== scenarios.length
  ) {
    throw new Error("Scenario identities must be unique");
  }

  const allowed = new Set([
    "id",
    "dimension",
    "module",
    "scenarios",
    "review",
    "evidence",
    "exclusions",
    "limitations",
  ]);

  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error(
      "Unknown assessment field; observation metadata is CLI-owned"
    );
  }

  return {
    dimension: source.dimension,
    evidence: strings(source.evidence),
    exclusions: strings(source.exclusions),
    id: parseArchitectureId(source.id),
    limitations: strings(source.limitations),
    module: parseModule(source.module),
    review: parseReview(source.review),
    scenarios,
  };
}

function uniqueIds(values: readonly { readonly id: string }[]): void {
  if (new Set(values.map((value) => value.id)).size !== values.length) {
    throw new Error("Locality inventory identities must be unique");
  }
}

function parsePolicySite(value: unknown): PolicySite {
  const source = object(value);
  const { role, implementation, trustBoundary } = source;

  if (role !== "policy" && role !== "call") {
    throw new Error("Locality site role must be policy or call");
  }

  if (
    (role === "policy" && implementation !== null) ||
    (role === "call" && typeof implementation !== "string")
  ) {
    throw new Error(
      "Policy sites require null implementation; calls reference a policy-site identity"
    );
  }

  return {
    evidence: strings(source.evidence),
    file: text(source.file),
    id: parseArchitectureId(source.id),
    implementation:
      implementation === null ? null : parseArchitectureId(implementation),
    location: text(source.location),
    reason: text(source.reason),
    role,
    trustBoundary: trustBoundary === null ? null : text(trustBoundary),
  };
}

function parseLocalityRule(value: unknown): LocalityRule {
  const source = object(value);
  const { status } = source;

  if (status !== "confirmed" && status !== "proposed" && status !== "unclear") {
    throw new Error(
      "Locality rule status must be confirmed, proposed or unclear"
    );
  }

  if (!Array.isArray(source.sites)) {
    throw new TypeError("Locality rule requires policy sites inventory");
  }

  const sites = source.sites.map(parsePolicySite);
  uniqueIds(sites);
  const implementations = sites.filter((site) => site.role === "policy");

  const positions = implementations.map((site) =>
    JSON.stringify([site.file, site.location])
  );

  if (new Set(positions).size !== positions.length) {
    throw new Error(
      "Independent policy sites must have distinct source locations"
    );
  }

  if (
    sites.some(
      (site) =>
        site.role === "call" &&
        !implementations.some(
          (implementation) => implementation.id === site.implementation
        )
    )
  ) {
    throw new Error(
      "Call must reference an inventoried independent policy site"
    );
  }

  return {
    description: text(source.description),
    equivalence: text(source.equivalence),
    evidence: strings(source.evidence),
    id: parseArchitectureId(source.id),
    sites,
    status,
  };
}

function parsePolicyChange(value: unknown): PolicyChange {
  const source = object(value);

  return {
    affectedOwners: [...new Set(strings(source.affectedOwners))],
    description: text(source.description),
    evidence: strings(source.evidence),
    id: parseArchitectureId(source.id),
  };
}

function parseLocalityAssessment(
  source: Record<string, unknown>
): LocalityAssessmentInput {
  const allowed = new Set([
    "id",
    "dimension",
    "module",
    "rules",
    "changes",
    "disagreements",
    "review",
    "evidence",
    "exclusions",
    "limitations",
  ]);

  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error(
      "Unknown locality field; observation metadata is CLI-owned"
    );
  }

  if (!Array.isArray(source.rules) || !Array.isArray(source.changes)) {
    throw new TypeError(
      "Locality assessment requires rules and change scenarios"
    );
  }

  const rules = source.rules.map(parseLocalityRule);
  const changes = source.changes.map(parsePolicyChange);
  uniqueIds(rules);
  uniqueIds(changes);

  return {
    changes,
    dimension: "change-locality",
    disagreements: strings(source.disagreements),
    evidence: strings(source.evidence),
    exclusions: strings(source.exclusions),
    id: parseArchitectureId(source.id),
    limitations: strings(source.limitations),
    module: parseModule(source.module),
    review: parseReview(source.review),
    rules,
  };
}
