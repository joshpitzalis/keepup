import type {
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
import { parseNavigabilityAssessment } from "./navigability-parse.ts";
/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- This JSON trust boundary reconstructs every accepted field before any writes. */
import {
  object,
  text,
  strings,
  parseArchitectureId,
  parseModule,
  parseReview,
} from "./parse-common.ts";
import { parseSeamAssessment } from "./seam-parse.ts";
import type {
  ExistingTest,
  TestabilityAssessmentInput,
  TestabilityScenario,
} from "./testability.ts";

export {
  parseArchitectureId,
  parseModule,
  parseReview,
} from "./parse-common.ts";

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

  if (source.dimension === "navigability") {
    return parseNavigabilityAssessment(source);
  }

  if (source.dimension === "behavioural-testability") {
    return parseTestabilityAssessment(source);
  }

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

function parseExistingTest(value: unknown): ExistingTest {
  const source = object(value);
  const file = text(source.file);
  const name = text(source.name);

  if (
    file.startsWith("-") ||
    file.startsWith("/") ||
    file.split(/[\\/]/u).includes("..") ||
    /[\r\n#]/u.test(name)
  ) {
    throw new Error(
      "Existing tests require relative source paths and a single-line top-level case name without #"
    );
  }

  return { file, name };
}

function parseTestabilityScenario(value: unknown): TestabilityScenario {
  const source = object(value);
  const assertion = object(source.assertion);
  const dependency = object(source.dependency);
  const { kind } = dependency;

  if (
    kind !== "pure" &&
    kind !== "local-substitute" &&
    kind !== "owned-remote" &&
    kind !== "true-external"
  ) {
    throw new Error("Unknown test dependency strategy");
  }

  if (assertion.status !== "reviewed" && assertion.status !== "provisional") {
    throw new Error("Assertion review status required");
  }

  if (
    assertion.kind !== "observable-outcome" &&
    assertion.kind !== "interaction-only"
  ) {
    throw new Error("Assertion outcome classification required");
  }

  if (
    typeof assertion.throughInterface !== "boolean" ||
    typeof dependency.compatibilityRequired !== "boolean"
  ) {
    throw new TypeError(
      "Explicit interface and compatibility decisions required"
    );
  }

  if (!Array.isArray(source.tests) || !Array.isArray(source.compatibility)) {
    throw new TypeError("Existing tests and compatibility inventory required");
  }

  return {
    assertion: {
      evidence: strings(assertion.evidence),
      explanation: text(assertion.explanation),
      kind: assertion.kind,
      status: assertion.status,
      throughInterface: assertion.throughInterface,
    },
    behaviour: text(source.behaviour),
    compatibility: source.compatibility.map(parseExistingTest),
    dependency: {
      compatibilityRequired: dependency.compatibilityRequired,
      justification: text(dependency.justification),
      kind,
    },
    failureInvariant: text(source.failureInvariant),
    id: parseArchitectureId(source.id),
    intendedInterface: text(source.intendedInterface),
    tests: source.tests.map(parseExistingTest),
  };
}

function parseTestabilityAssessment(
  source: Record<string, unknown>
): TestabilityAssessmentInput {
  const allowed = new Set([
    "id",
    "dimension",
    "module",
    "scenarios",
    "discovery",
    "environmentRequirements",
    "review",
    "evidence",
    "exclusions",
    "limitations",
  ]);

  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error(
      "Unknown testability field; execution metadata is CLI-owned"
    );
  }

  if (source.discovery !== "complete" && source.discovery !== "incomplete") {
    throw new Error("Explicit testability discovery status required");
  }

  if (!Array.isArray(source.scenarios)) {
    throw new TypeError("Fixed testability scenario inventory required");
  }

  const scenarios = source.scenarios.map(parseTestabilityScenario);
  uniqueIds(scenarios);
  const module = parseModule(source.module);

  if (
    scenarios.some(
      (scenario) => !module.interface.includes(scenario.intendedInterface)
    )
  ) {
    throw new Error("Scenarios must name a declared intended module interface");
  }

  return {
    dimension: "behavioural-testability",
    discovery: source.discovery,
    environmentRequirements: strings(source.environmentRequirements),
    evidence: strings(source.evidence),
    exclusions: strings(source.exclusions),
    id: parseArchitectureId(source.id),
    limitations: strings(source.limitations),
    module,
    review: parseReview(source.review),
    scenarios,
  };
}
