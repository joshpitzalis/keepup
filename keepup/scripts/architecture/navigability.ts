import type { ArchitectureModule, ArchitectureReview } from "./domain.ts";

export interface NavigationStep {
  readonly id: string;
  readonly moduleId: string | null;
  readonly file: string;
  readonly location: string;
  readonly kind: "implementation" | "interface" | "private-helper";
  readonly necessary: boolean;
  readonly reason: string;
}

export interface ComprehensionQuestion {
  readonly id: string;
  readonly question: string;
  readonly owningModule: string | null;
  readonly trailStatus: "complete" | "incomplete" | "unresolved";
  readonly trail: readonly NavigationStep[];
  readonly evidence: readonly string[];
  readonly namingIssues: readonly string[];
  readonly disagreements: readonly string[];
  readonly readability: "coherent" | "unclear" | "consolidation-obscures";
  readonly readabilityExplanation: string;
}

export interface NavigabilityAssessmentInput {
  readonly id: string;
  readonly dimension: "navigability";
  readonly module: ArchitectureModule;
  readonly questions: readonly ComprehensionQuestion[];
  readonly review: ArchitectureReview;
  readonly evidence: readonly string[];
  readonly exclusions: readonly string[];
  readonly limitations: readonly string[];
}

export interface NavigationMeasurement {
  readonly id: string;
  readonly question: string;
  readonly observedTransitions: number;
  readonly transitions: number | null;
  readonly value: number | null;
  readonly status: "measured" | "unavailable";
  readonly reasons: readonly string[];
}

export interface NavigabilityMeasurements {
  readonly status: "measured" | "unavailable";
  readonly value: number | null;
  readonly denominator: number;
  readonly assessed: number;
  readonly transitions: number | null;
  readonly questions: readonly NavigationMeasurement[];
}

function questionMeasurement(
  question: ComprehensionQuestion
): NavigationMeasurement {
  let previousModule = question.owningModule;
  let observedTransitions = 0;
  const reasons: string[] = [];

  for (const step of question.trail) {
    if (!step.necessary || step.kind !== "implementation") {
      continue;
    }

    if (
      step.moduleId !== null &&
      previousModule !== null &&
      step.moduleId !== previousModule
    ) {
      observedTransitions += 1;
    }

    previousModule = step.moduleId;
  }

  if (
    question.owningModule === null ||
    question.trail.some((step) => step.necessary && step.moduleId === null)
  ) {
    reasons.push(
      "Ambiguous module ownership or unresolved necessary implementation attribution"
    );
  }

  if (question.trailStatus !== "complete") {
    reasons.push(
      `Reviewed sufficient trail ${question.trailStatus}; smaller observed count cannot establish improvement`
    );
  }

  if (!question.trail.length || !question.evidence.length) {
    reasons.push("Missing sufficient trail or concrete source evidence");
  }

  if (question.readability !== "coherent") {
    reasons.push(
      `Internal readability ${question.readability}; consolidation may hide navigation rather than improve understanding: ${question.readabilityExplanation}`
    );
  }

  const measured = reasons.length === 0;

  return {
    id: question.id,
    observedTransitions,
    question: question.question,
    reasons,
    status: measured ? "measured" : "unavailable",
    transitions: measured ? observedTransitions : null,
    value: measured ? 1 / (1 + observedTransitions) : null,
  };
}

export function navigabilityMeasurements(
  input: NavigabilityAssessmentInput
): NavigabilityMeasurements {
  const questions = input.questions.map(questionMeasurement);

  const assessed = questions.filter(
    (question) => question.status === "measured"
  ).length;

  const measured = questions.length > 0 && assessed === questions.length;

  return {
    assessed,
    denominator: questions.length,
    questions,
    status: measured ? "measured" : "unavailable",
    transitions: measured
      ? questions.reduce(
          (sum, question) => sum + (question.transitions ?? 0),
          0
        )
      : null,
    value: measured
      ? questions.reduce((sum, question) => sum + (question.value ?? 0), 0) /
        questions.length
      : null,
  };
}

export function navigabilityEvidence(
  input: NavigabilityAssessmentInput
): string[] {
  return input.questions.flatMap((question) => [
    ...question.evidence,
    ...question.trail.map((step) => step.file),
  ]);
}

export function navigabilityLimitations(
  input: NavigabilityAssessmentInput
): string[] {
  return [
    ...(input.questions.length
      ? []
      : ["No fixed comprehension questions; zero denominator unavailable"]),
    ...input.questions.flatMap((question) => [
      ...questionMeasurement(question).reasons.map(
        (reason) => `${question.id}: ${reason}`
      ),
      ...question.namingIssues.map(
        (issue) => `${question.id}: domain naming issue: ${issue}`
      ),
      ...question.disagreements.map(
        (disagreement) =>
          `${question.id}: reviewer disagreement: ${disagreement}`
      ),
    ]),
    "Experimental reviewed navigability; preserve interface leverage and internal readability. Where to look differs from where policy changes must be made.",
  ];
}
