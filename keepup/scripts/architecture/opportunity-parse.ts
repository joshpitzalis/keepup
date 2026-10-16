import type { OpportunityInput } from "./opportunities.ts";
import { object, parseArchitectureId, strings, text } from "./parse-common.ts";

/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- This JSON boundary reconstructs all fields and rejects protected metadata. */
function fields(
  value: unknown,
  allowed: readonly string[]
): Record<string, unknown> {
  const result = object(value);

  if (Object.keys(result).some((key) => !allowed.includes(key))) {
    throw new Error(
      "Unknown opportunity field; provenance and readiness decisions are CLI-owned"
    );
  }

  return result;
}

function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  const result = allowed.find((candidate) => candidate === value);

  if (result === undefined) {
    throw new Error("Invalid opportunity choice");
  }

  return result;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

export function parseOpportunity(value: unknown): OpportunityInput {
  const input = fields(value, [
    "id",
    "behaviour",
    "modules",
    "findings",
    "context",
    "relevance",
    "strength",
    "decision",
    "outcome",
    "rawTarget",
    "scope",
    "verification",
    "risks",
    "stopCondition",
    "conflicts",
    "limitations",
  ]);

  const context = fields(input.context, ["mission", "nextChange", "documents"]);

  const verification = fields(input.verification, [
    "testCommand",
    "readiness",
    "evidence",
    "invariants",
  ]);

  if (!Array.isArray(input.findings) || !Array.isArray(input.conflicts)) {
    throw new TypeError("Opportunity findings and conflicts must be arrays");
  }

  const target =
    input.rawTarget === null
      ? null
      : fields(input.rawTarget, ["assessmentId", "metric", "goal"]);

  if (
    target &&
    (typeof target.goal !== "number" ||
      !Number.isFinite(target.goal) ||
      target.goal < 0)
  ) {
    throw new Error(
      "Opportunity raw target requires a finite nonnegative goal"
    );
  }

  return {
    behaviour: text(input.behaviour),
    conflicts: input.conflicts.map((entry) => {
      const conflict = fields(entry, ["document", "description"]);

      return {
        description: text(conflict.description),
        document: text(conflict.document),
      };
    }),
    context: {
      documents: strings(context.documents),
      mission: nullableText(context.mission),
      nextChange: nullableText(context.nextChange),
    },
    decision: choice(input.decision, [
      "refactor",
      "assessment",
      "preparation",
      "defer",
      "none",
    ]),
    findings: input.findings.map((entry) => {
      const finding = fields(entry, [
        "assessmentId",
        "description",
        "evidence",
      ]);

      return {
        assessmentId: parseArchitectureId(finding.assessmentId),
        description: text(finding.description),
        evidence: strings(finding.evidence),
      };
    }),
    id: parseArchitectureId(input.id),
    limitations: strings(input.limitations),
    modules: strings(input.modules),
    outcome: text(input.outcome),
    rawTarget:
      target === null
        ? null
        : {
            assessmentId: parseArchitectureId(target.assessmentId),
            // SAFETY: the finite nonnegative number was checked above before constructing the parsed target.
            goal: target.goal as number,
            metric: choice(target.metric, [
              "avoidableObligations",
              "independentPolicySites",
              "violations",
              "transitions",
              "cyclicGroups",
            ]),
          },
    relevance: nullableText(input.relevance),
    risks: strings(input.risks),
    scope: strings(input.scope),
    stopCondition: text(input.stopCondition),
    strength: choice(input.strength, [
      "strong",
      "worth-exploring",
      "speculative",
    ]),
    verification: {
      evidence: strings(verification.evidence),
      invariants: strings(verification.invariants),
      readiness: choice(verification.readiness, [
        "reviewed-ready",
        "unknown",
        "inadequate",
      ]),
      testCommand: nullableText(verification.testCommand),
    },
  };
}
