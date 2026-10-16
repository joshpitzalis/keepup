import type {
  ArchitectureReview,
  AssessmentInput,
  CallerObligation,
  InterfaceScenario,
} from "./domain.ts";
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
