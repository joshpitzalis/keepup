import type { ArchitectureModule, ArchitectureReview } from "./domain.ts";

export interface PolicySite {
  readonly id: string;
  readonly file: string;
  readonly location: string;
  readonly role: "policy" | "call";
  readonly implementation: string | null;
  readonly trustBoundary: string | null;
  readonly reason: string;
  readonly evidence: readonly string[];
}

export interface LocalityRule {
  readonly id: string;
  readonly description: string;
  readonly status: "confirmed" | "proposed" | "unclear";
  readonly equivalence: string;
  readonly evidence: readonly string[];
  readonly sites: readonly PolicySite[];
}

export interface PolicyChange {
  readonly id: string;
  readonly description: string;
  readonly affectedOwners: readonly string[];
  readonly evidence: readonly string[];
}

export interface LocalityAssessmentInput {
  readonly id: string;
  readonly dimension: "change-locality";
  readonly module: ArchitectureModule;
  readonly rules: readonly LocalityRule[];
  readonly changes: readonly PolicyChange[];
  readonly disagreements: readonly string[];
  readonly review: ArchitectureReview;
  readonly evidence: readonly string[];
  readonly exclusions: readonly string[];
  readonly limitations: readonly string[];
}

export interface LocalityRuleMeasurement {
  readonly id: string;
  readonly independentPolicySites: number;
  readonly calls: number;
  readonly value: number | null;
}

export interface LocalityMeasurements {
  readonly status: "measured" | "unavailable";
  readonly value: number | null;
  readonly denominator: number;
  readonly assessed: number;
  readonly independentPolicySites: number;
  readonly calls: number;
  readonly proposedRules: number;
  readonly unclearRules: number;
  readonly rules: readonly LocalityRuleMeasurement[];
}

function ruleMeasurement(rule: LocalityRule): LocalityRuleMeasurement {
  const independent = rule.sites.filter((site) => site.role === "policy");

  const evidenceComplete =
    rule.evidence.length > 0 &&
    independent.length > 0 &&
    independent.every((site) => site.evidence.length > 0);

  return {
    calls: rule.sites.filter((site) => site.role === "call").length,
    id: rule.id,
    independentPolicySites: independent.length,
    value: evidenceComplete ? 1 / independent.length : null,
  };
}

export function localityMeasurements(
  input: LocalityAssessmentInput
): LocalityMeasurements {
  const confirmed = input.rules
    .filter((rule) => rule.status === "confirmed")
    .map(ruleMeasurement);

  const assessed = confirmed.filter((rule) => rule.value !== null);
  const complete = confirmed.length > 0 && assessed.length === confirmed.length;

  return {
    assessed: assessed.length,
    calls: confirmed.reduce((sum, rule) => sum + rule.calls, 0),
    denominator: confirmed.length,
    independentPolicySites: confirmed.reduce(
      (sum, rule) => sum + rule.independentPolicySites,
      0
    ),
    proposedRules: input.rules.filter((rule) => rule.status === "proposed")
      .length,
    rules: confirmed,
    status: complete ? "measured" : "unavailable",
    unclearRules: input.rules.filter((rule) => rule.status === "unclear")
      .length,
    value: complete
      ? assessed.reduce((sum, rule) => sum + (rule.value ?? 0), 0) /
        confirmed.length
      : null,
  };
}

export function localityEvidence(input: LocalityAssessmentInput): string[] {
  return [
    ...input.rules.flatMap((rule) => [
      ...rule.evidence,
      ...rule.sites.flatMap((site) => [site.file, ...site.evidence]),
    ]),
    ...input.changes.flatMap((change) => change.evidence),
  ];
}

export function localityLimitations(input: LocalityAssessmentInput): string[] {
  const result = input.disagreements.map(
    (disagreement) => `Reviewer disagreement: ${disagreement}`
  );

  const metrics = localityMeasurements(input);

  if (!metrics.denominator) {
    result.push("No confirmed policy rules; zero denominator is unavailable");
  }

  for (const rule of input.rules) {
    if (rule.status !== "confirmed") {
      result.push(
        `Rule ${rule.id}: ${rule.status} equivalence; excluded from confirmed denominator`
      );
    } else if (ruleMeasurement(rule).value === null) {
      result.push(
        `Rule ${rule.id}: absent independent implementation or missing evidence; unavailable`
      );
    }

    for (const site of rule.sites) {
      if (site.trustBoundary !== null) {
        result.push(
          `Site ${site.id}: preserve justified validation at ${site.trustBoundary}; ${site.reason}`
        );
      }
    }
  }

  if (!input.changes.length) {
    result.push(
      "No representative change scenarios; affected owners unavailable"
    );
  }

  for (const change of input.changes) {
    if (!change.evidence.length || !change.affectedOwners.length) {
      result.push(
        `Change ${change.id}: affected-owner evidence incomplete; owners remain separate from policy-site score`
      );
    }
  }

  return result;
}
