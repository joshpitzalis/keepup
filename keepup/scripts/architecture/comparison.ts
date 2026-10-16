import type {
  ArchitectureAssessment,
  ArchitectureInspection,
  AssessmentMeasurements,
} from "./domain.ts";
import { architectureText, writeArchitectureReport } from "./report.ts";
import type { ArchitectureReportResult } from "./report.ts";
import { architectureDigest, inspectAssessment } from "./storage.ts";

export interface ArchitectureComparison {
  readonly schemaVersion: 1;
  readonly comparable: boolean;
  readonly reasons: readonly string[];
  readonly before: ArchitectureInspection;
  readonly after: ArchitectureInspection;
  readonly changes: ArchitectureChanges;
}

export type ArchitectureChanges =
  | {
      readonly value: number | null;
      readonly domainObligations: number | null;
      readonly avoidableObligations: number | null;
    }
  | {
      readonly value: number | null;
      readonly independentPolicySites: number | null;
      readonly calls: number | null;
    }
  | { readonly value: null };

function definition(assessment: ArchitectureAssessment): string {
  const { input, observation } = assessment;

  return JSON.stringify({
    assets: observation.assets,
    dimension: input.dimension,
    exclusions: input.exclusions.toSorted(),
    inventory:
      input.dimension === "interface-leverage"
        ? input.scenarios
            .map((scenario) => ({
              description: scenario.description,
              id: scenario.id,
            }))
            .toSorted((one, two) => one.id.localeCompare(two.id))
        : {
            changes: input.changes
              .map((change) => ({
                affectedOwners: change.affectedOwners.toSorted(),
                description: change.description,
                id: change.id,
              }))
              .toSorted((one, two) => one.id.localeCompare(two.id)),
            rules: input.rules
              .map((rule) => ({
                description: rule.description,
                equivalence: rule.equivalence,
                id: rule.id,
                status: rule.status,
              }))
              .toSorted((one, two) => one.id.localeCompare(two.id)),
          },
    module: {
      id: input.module.id,
      interface: input.module.interface.toSorted(),
      members: input.module.members.toSorted(),
    },
    rubric: observation.rubric,
  });
}

export function compareAssessments(
  root: string,
  state: string,
  beforeId: string,
  afterId: string
): ArchitectureComparison {
  const before = inspectAssessment(root, state, beforeId);
  const after = inspectAssessment(root, state, afterId);
  const reasons: string[] = [];

  if (definition(before.assessment) !== definition(after.assessment)) {
    reasons.push(
      "Subject, membership, interface, scenario/rule/change inventory, exclusions or evaluator definitions changed"
    );
  }

  const one = before.assessment.measurements;
  const two = after.assessment.measurements;

  if (one.status !== "measured" || two.status !== "measured") {
    reasons.push(
      "Required measurements are unavailable; missing evidence is not zero"
    );
  }

  const comparable = reasons.length === 0;

  return {
    after,
    before,
    changes: measurementChanges(one, two, comparable),
    comparable,
    reasons,
    schemaVersion: 1,
  };
}

function measurementChanges(
  before: AssessmentMeasurements,
  after: AssessmentMeasurements,
  comparable: boolean
): ArchitectureChanges {
  const value =
    comparable && before.value !== null && after.value !== null
      ? after.value - before.value
      : null;

  if ("domainObligations" in before && "domainObligations" in after) {
    return {
      avoidableObligations: comparable
        ? after.avoidableObligations - before.avoidableObligations
        : null,
      domainObligations: comparable
        ? after.domainObligations - before.domainObligations
        : null,
      value,
    };
  }

  if ("independentPolicySites" in before && "independentPolicySites" in after) {
    return {
      calls: comparable ? after.calls - before.calls : null,
      independentPolicySites: comparable
        ? after.independentPolicySites - before.independentPolicySites
        : null,
      value,
    };
  }

  return { value: null };
}

export function comparisonText(result: ArchitectureComparison): string {
  return [
    `Architecture comparison: ${result.before.assessment.id} → ${result.after.assessment.id}`,
    `Comparable: ${result.comparable ? "yes" : "no"}`,
    ...result.reasons.map((reason) => `Incomparable: ${reason}`),
    "Before (historical captured observation):",
    architectureText(result.before),
    "After (captured observation; freshness is checked separately):",
    architectureText(result.after),
    `Changes (after minus before): ${JSON.stringify(result.changes)}`,
    "Reviewed ratings remain advisory; comparison grants no learning credit.",
  ].join("\n");
}

export function comparisonReport(
  state: string,
  result: ArchitectureComparison,
  open: boolean
): ArchitectureReportResult {
  return writeArchitectureReport(
    state,
    `comparison-${architectureDigest(JSON.stringify([result.before.assessment.id, result.after.assessment.id]))}`,
    "Architecture comparison",
    comparisonText(result),
    JSON.stringify(result, null, 2),
    open
  );
}
