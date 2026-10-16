import type {
  ArchitectureAssessment,
  ArchitectureInspection,
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
  readonly changes: {
    readonly value: number | null;
    readonly domainObligations: number | null;
    readonly avoidableObligations: number | null;
  };
}

function definition(assessment: ArchitectureAssessment): string {
  const { input, observation } = assessment;

  return JSON.stringify({
    assets: observation.assets,
    dimension: input.dimension,
    exclusions: input.exclusions.toSorted(),
    module: {
      id: input.module.id,
      interface: input.module.interface.toSorted(),
      members: input.module.members.toSorted(),
    },
    rubric: observation.rubric,
    scenarios: input.scenarios
      .map((scenario) => ({
        description: scenario.description,
        id: scenario.id,
      }))
      .toSorted((one, two) => one.id.localeCompare(two.id)),
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
      "Subject, membership, interface, scenario inventory, exclusions or evaluator definitions changed"
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
    changes: {
      avoidableObligations: comparable
        ? two.avoidableObligations - one.avoidableObligations
        : null,
      domainObligations: comparable
        ? two.domainObligations - one.domainObligations
        : null,
      value:
        comparable && one.value !== null && two.value !== null
          ? two.value - one.value
          : null,
    },
    comparable,
    reasons,
    schemaVersion: 1,
  };
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
