/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- This JSON boundary reconstructs reviewed navigation evidence before persistence. */
import type {
  ComprehensionQuestion,
  NavigabilityAssessmentInput,
  NavigationStep,
} from "./navigability.ts";
import {
  object,
  parseArchitectureId,
  parseModule,
  parseReview,
  strings,
  text,
} from "./parse-common.ts";

function uniqueIds(values: readonly { readonly id: string }[]): void {
  if (new Set(values.map((value) => value.id)).size !== values.length) {
    throw new Error("Navigation inventory identities must be unique");
  }
}

function parseNavigationStep(value: unknown): NavigationStep {
  const source = object(value);
  const { kind, necessary } = source;

  if (
    kind !== "implementation" &&
    kind !== "interface" &&
    kind !== "private-helper"
  ) {
    throw new Error(
      "Navigation step requires implementation, interface or private-helper kind"
    );
  }

  if (
    typeof necessary !== "boolean" ||
    (kind === "private-helper" && necessary)
  ) {
    throw new Error(
      "Explicit necessary decision required; hidden private helpers cannot be necessary implementation inspections"
    );
  }

  return {
    file: text(source.file),
    id: parseArchitectureId(source.id),
    kind,
    location: text(source.location),
    moduleId:
      source.moduleId === null ? null : parseArchitectureId(source.moduleId),
    necessary,
    reason: text(source.reason),
  };
}

function parseQuestion(value: unknown): ComprehensionQuestion {
  const source = object(value);
  const { trailStatus, readability } = source;

  if (
    trailStatus !== "complete" &&
    trailStatus !== "incomplete" &&
    trailStatus !== "unresolved"
  ) {
    throw new Error(
      "Navigation trail must be complete, incomplete or unresolved"
    );
  }

  if (
    readability !== "coherent" &&
    readability !== "unclear" &&
    readability !== "consolidation-obscures"
  ) {
    throw new Error("Explicit internal readability review required");
  }

  if (!Array.isArray(source.trail)) {
    throw new TypeError("Reviewed sufficient evidence trail required");
  }

  const trail = source.trail.map(parseNavigationStep);
  uniqueIds(trail);

  return {
    disagreements: strings(source.disagreements),
    evidence: strings(source.evidence),
    id: parseArchitectureId(source.id),
    namingIssues: strings(source.namingIssues),
    owningModule:
      source.owningModule === null
        ? null
        : parseArchitectureId(source.owningModule),
    question: text(source.question),
    readability,
    readabilityExplanation: text(source.readabilityExplanation),
    trail,
    trailStatus,
  };
}

export function parseNavigabilityAssessment(
  value: unknown
): NavigabilityAssessmentInput {
  const source = object(value);

  const allowed = new Set([
    "id",
    "dimension",
    "module",
    "questions",
    "review",
    "evidence",
    "exclusions",
    "limitations",
  ]);

  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error(
      "Unknown navigability field; observation metadata is CLI-owned"
    );
  }

  if (!Array.isArray(source.questions)) {
    throw new TypeError("Fixed comprehension questions inventory required");
  }

  const module = parseModule(source.module);
  const questions = source.questions.map(parseQuestion);
  uniqueIds(questions);

  if (
    questions.some(
      (question) =>
        question.owningModule !== null && question.owningModule !== module.id
    )
  ) {
    throw new Error(
      "Question ownership must name the assessed logical module, or null when ambiguous"
    );
  }

  if (
    questions.some((question) =>
      question.trail.some(
        (step) =>
          step.moduleId === module.id && !module.members.includes(step.file)
      )
    )
  ) {
    throw new Error(
      "Owned navigation steps must belong to declared implementation membership"
    );
  }

  return {
    dimension: "navigability",
    evidence: strings(source.evidence),
    exclusions: strings(source.exclusions),
    id: parseArchitectureId(source.id),
    limitations: strings(source.limitations),
    module,
    questions,
    review: parseReview(source.review),
  };
}
