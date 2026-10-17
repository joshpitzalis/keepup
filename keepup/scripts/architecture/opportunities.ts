import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  ArchitectureInspection,
  AssessmentMeasurements,
  ManifestEntry,
} from "./domain.ts";
import { parseOpportunity } from "./opportunity-parse.ts";
import { parseArchitectureId } from "./parse.ts";
import { writeArchitectureReport } from "./report.ts";
import {
  architectureDigest,
  archive,
  assets,
  atomicPublish,
  inspectAssessment,
  manifest,
  revision,
  verifySnapshots,
  readAssessment,
} from "./storage.ts";

export interface OpportunityInput {
  readonly id: string;
  readonly behaviour: string;
  readonly modules: readonly string[];
  readonly findings: readonly {
    readonly assessmentId: string;
    readonly description: string;
    readonly evidence: readonly string[];
  }[];
  readonly context: {
    readonly mission: string | null;
    readonly nextChange: string | null;
    readonly documents: readonly string[];
  };
  readonly relevance: string | null;
  readonly strength: "strong" | "worth-exploring" | "speculative";
  readonly decision:
    | "refactor"
    | "assessment"
    | "preparation"
    | "defer"
    | "none";
  readonly outcome: string;
  readonly rawTarget: {
    readonly assessmentId: string;
    readonly metric:
      | "avoidableObligations"
      | "independentPolicySites"
      | "violations"
      | "transitions"
      | "cyclicGroups";
    readonly goal: number;
  } | null;
  readonly scope: readonly string[];
  readonly verification: {
    readonly testCommand: string | null;
    readonly readiness: "reviewed-ready" | "unknown" | "inadequate";
    readonly evidence: readonly string[];
    readonly invariants: readonly string[];
  };
  readonly risks: readonly string[];
  readonly stopCondition: string;
  readonly conflicts: readonly {
    readonly document: string;
    readonly description: string;
  }[];
  readonly limitations: readonly string[];
}

export interface ArchitectureOpportunity {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly input: OpportunityInput;
  readonly inputDigest: string;
  readonly decision: OpportunityInput["decision"];
  readonly strength: OpportunityInput["strength"];
  readonly target: {
    readonly baseline: number;
    readonly goal: number;
    readonly metric: string;
  } | null;
  readonly reasons: readonly string[];
  readonly missingDimensions: readonly string[];
  readonly exerciseAvailable: boolean;
  readonly assessments: readonly ArchitectureInspection[];
  readonly contextDocuments: readonly {
    readonly path: string;
    readonly hash: string;
    readonly text: string;
  }[];
  readonly observation: {
    readonly id: string;
    readonly time: string;
    readonly observer: string;
    readonly revision: string | null;
    readonly manifest: readonly ManifestEntry[];
    readonly assets: readonly ManifestEntry[];
    readonly configHash: string;
  };
}

function pathFor(state: string, id: string): string {
  return join(
    state,
    "architecture",
    "opportunities",
    `${parseArchitectureId(id)}.json`
  );
}

function rawValue(
  measurements: AssessmentMeasurements,
  metric: string
): number | null {
  if (
    metric === "avoidableObligations" &&
    "avoidableObligations" in measurements
  ) {
    return measurements.avoidableObligations;
  }

  if (
    metric === "independentPolicySites" &&
    "independentPolicySites" in measurements
  ) {
    return measurements.independentPolicySites;
  }

  if (
    metric === "violations" &&
    "violations" in measurements &&
    measurements.violations >= 0
  ) {
    return measurements.violations;
  }

  if (metric === "cyclicGroups" && "cyclicGroups" in measurements) {
    return measurements.cyclicGroups ?? null;
  }

  if (metric === "transitions" && "transitions" in measurements) {
    return measurements.transitions;
  }

  return null;
}

/* oxlint-disable anti-slop/no-runtime-typeof -- Persisted opportunity metadata and config are untrusted JSON at this boundary. */
export function readOpportunity(
  state: string,
  id: string
): ArchitectureOpportunity {
  const envelope = JSON.parse(readFileSync(pathFor(state, id), "utf-8"));

  if (
    !envelope ||
    typeof envelope.payload !== "string" ||
    architectureDigest(envelope.payload) !== envelope.digest
  ) {
    throw new Error("Invalid architecture opportunity; left untouched");
  }

  const result = JSON.parse(envelope.payload);
  const input = parseOpportunity(result.input);

  if (
    result.schemaVersion !== 1 ||
    result.id !== id ||
    result.inputDigest !== architectureDigest(JSON.stringify(input)) ||
    !result.observation ||
    !Array.isArray(result.observation.manifest) ||
    !Array.isArray(result.observation.assets) ||
    !Array.isArray(result.assessments) ||
    typeof result.exerciseAvailable !== "boolean" ||
    !Number.isFinite(Date.parse(result.observation.time)) ||
    typeof result.observation.observer !== "string" ||
    !/^[a-f0-9]{64}$/u.test(result.observation.configHash) ||
    !Array.isArray(result.reasons) ||
    !Array.isArray(result.contextDocuments)
  ) {
    throw new Error("Invalid architecture opportunity schema; left untouched");
  }

  return verifiedOpportunityArchive(state, result);
}

function verifiedOpportunityArchive(
  state: string,
  result: ArchitectureOpportunity
): ArchitectureOpportunity {
  verifySnapshots(state, [
    ...result.observation.manifest,
    ...result.observation.assets,
  ]);

  for (const inspection of result.assessments) {
    if (
      JSON.stringify(readAssessment(state, inspection.assessment.id)) !==
      JSON.stringify(inspection.assessment)
    ) {
      throw new Error(
        "Opportunity linked assessment does not match captured evidence"
      );
    }
  }

  for (const document of result.contextDocuments) {
    if (
      !result.observation.manifest.some(
        (entry: ManifestEntry) =>
          entry.path === document.path && entry.hash === document.hash
      ) ||
      readFileSync(
        join(state, "architecture", "snapshots", document.hash),
        "utf-8"
      ) !== document.text
    ) {
      throw new Error("Opportunity context does not match captured document");
    }
  }

  return result;
}

function verifyOpportunityReferences(
  input: OpportunityInput,
  before: readonly ManifestEntry[],
  assessments: readonly ArchitectureInspection[]
): void {
  const references = [
    ...input.scope,
    ...input.context.documents,
    ...input.verification.evidence,
    ...input.findings.flatMap((finding) => finding.evidence),
    ...input.conflicts.map((conflict) => conflict.document),
  ];

  for (const file of references) {
    if (!before.some((entry) => entry.path === file && entry.hash !== null)) {
      throw new Error(
        `Opportunity evidence must be a tracked regular source file: ${file}`
      );
    }
  }

  for (const finding of input.findings) {
    const captured = assessments.find(
      (inspection) => inspection.assessment.id === finding.assessmentId
    );

    if (
      finding.evidence.some(
        (file) =>
          !captured?.assessment.observation.manifest.some(
            (entry) => entry.path === file && entry.hash !== null
          )
      )
    ) {
      throw new Error(
        "Opportunity finding evidence is outside its captured assessment"
      );
    }
  }

  if (
    input.conflicts.some(
      (conflict) => !input.context.documents.includes(conflict.document)
    )
  ) {
    throw new Error(
      "Opportunity conflicts must cite a supplied context document"
    );
  }

  if (
    assessments.length &&
    input.modules.some(
      (id) =>
        !assessments.some((inspection) => {
          const declaration = inspection.assessment.input;

          const modules =
            declaration.dimension === "seam-integrity"
              ? declaration.modules
              : [declaration.module];

          return modules.some((module) => module.id === id);
        })
    )
  ) {
    throw new Error("Opportunity module must belong to its linked assessment");
  }
}

function opportunityTarget(
  input: OpportunityInput,
  assessments: readonly ArchitectureInspection[]
): ArchitectureOpportunity["target"] {
  const targetAssessment = assessments.find(
    (inspection) => inspection.assessment.id === input.rawTarget?.assessmentId
  )?.assessment;

  const baseline =
    targetAssessment && input.rawTarget
      ? rawValue(targetAssessment.measurements, input.rawTarget.metric)
      : null;

  const target =
    input.rawTarget && baseline !== null && input.rawTarget.goal < baseline
      ? { baseline, goal: input.rawTarget.goal, metric: input.rawTarget.metric }
      : null;

  return target;
}

function findingsIncomplete(
  input: OpportunityInput,
  assessments: readonly ArchitectureInspection[]
): boolean {
  return (
    !assessments.length ||
    assessments.some(
      (inspection) =>
        inspection.freshness.status === "stale" ||
        inspection.assessment.measurements.status !== "measured" ||
        ("review" in inspection.assessment.input &&
          inspection.assessment.input.review.status !== "reviewed")
    ) ||
    input.findings.some((finding) => !finding.evidence.length)
  );
}

function testsInadequate(
  input: OpportunityInput,
  testCommand: string | null
): boolean {
  return (
    input.verification.readiness !== "reviewed-ready" ||
    !input.verification.evidence.length ||
    !input.verification.invariants.length ||
    !input.verification.testCommand ||
    input.verification.testCommand !== testCommand
  );
}

function opportunityReadiness(
  input: OpportunityInput,
  assessments: readonly ArchitectureInspection[],
  testCommand: string | null
): Pick<
  ArchitectureOpportunity,
  "decision" | "reasons" | "strength" | "target"
> {
  const reasons: string[] = [];
  let { decision } = input;

  const contextual =
    !!(input.context.mission || input.context.nextChange) &&
    input.relevance !== null;

  const strength = contextual ? input.strength : "speculative";

  if (!contextual) {
    reasons.push(
      "No supplied mission/next-change relevance; speculative context cannot justify an automatic exercise"
    );

    if (decision === "refactor") {
      decision = "defer";
    }
  }

  if (findingsIncomplete(input, assessments)) {
    reasons.push(
      "Current complete accepted findings are missing; assess the evidence before refactoring"
    );

    if (decision === "refactor") {
      decision = "assessment";
    }
  }

  const target = opportunityTarget(input, assessments);

  if (
    !target ||
    !input.scope.length ||
    !input.modules.length ||
    !input.risks.length
  ) {
    reasons.push(
      "No bounded improving raw target, module scope or behavioural risk inventory; prepare an assessment"
    );

    if (decision === "refactor") {
      decision = "assessment";
    }
  }

  if (testsInadequate(input, testCommand)) {
    reasons.push(
      "Existing behavioural tests are inadequate or unreviewed; prepare verification before refactoring"
    );

    if (decision === "refactor") {
      decision = "preparation";
    }
  }

  if (input.conflicts.length) {
    reasons.push(
      "Supplied glossary/ADR conflict requires human resolution; documents were not changed"
    );

    if (decision !== "none") {
      decision = "defer";
    }
  }

  return { decision, reasons, strength, target };
}

export function recordOpportunity(
  root: string,
  state: string,
  input: OpportunityInput
): ArchitectureOpportunity {
  const path = pathFor(state, input.id);
  const inputDigest = architectureDigest(JSON.stringify(input));

  if (existsSync(path)) {
    const previous = readOpportunity(state, input.id);

    if (previous.inputDigest !== inputDigest) {
      throw new Error("Opportunity retry id already used with different input");
    }

    return previous;
  }

  const before = manifest(root);
  const evaluator = assets();
  const sha = revision(root);
  const configBytes = readFileSync(join(state, "config.json"));
  const config = JSON.parse(configBytes.toString("utf-8"));

  const assessments = [
    ...new Set(input.findings.map((finding) => finding.assessmentId)),
  ].map((id) => inspectAssessment(root, state, id));

  verifyOpportunityReferences(input, before, assessments);

  const { decision, reasons, strength, target } = opportunityReadiness(
    input,
    assessments,
    config.testCommand
  );

  archive(root, state, before);
  archive(import.meta.dirname, state, evaluator);

  if (
    JSON.stringify(before) !== JSON.stringify(manifest(root)) ||
    JSON.stringify(evaluator) !== JSON.stringify(assets()) ||
    sha !== revision(root) ||
    !configBytes.equals(readFileSync(join(state, "config.json")))
  ) {
    throw new Error(
      "Source or definitions changed during opportunity capture; retry"
    );
  }

  const author = spawnSync("git", ["config", "user.email"], {
    cwd: root,
    encoding: "utf-8",
  });

  if (author.status !== 0 || !author.stdout.trim()) {
    throw new Error(
      "Set git user.email before recording architecture opportunities"
    );
  }

  const result: ArchitectureOpportunity = {
    assessments,
    contextDocuments: before.flatMap((entry) =>
      entry.hash !== null && input.context.documents.includes(entry.path)
        ? [
            {
              hash: entry.hash,
              path: entry.path,
              text: readFileSync(
                join(state, "architecture", "snapshots", entry.hash),
                "utf-8"
              ),
            },
          ]
        : []
    ),
    decision,
    exerciseAvailable: true,
    id: input.id,
    input,
    inputDigest,
    missingDimensions: [
      "interface-leverage",
      "change-locality",
      "seam-integrity",
      "behavioural-testability",
      "navigability",
    ].filter(
      (dimension) =>
        !assessments.some(
          (inspection) => inspection.assessment.dimension === dimension
        )
    ),
    observation: {
      assets: evaluator,
      configHash: architectureDigest(configBytes),
      id: randomUUID(),
      manifest: before,
      observer: author.stdout.trim(),
      revision: sha,
      time: new Date().toISOString(),
    },
    reasons,
    schemaVersion: 1,
    strength,
    target,
  };

  const payload = JSON.stringify(result);

  if (
    !atomicPublish(
      path,
      JSON.stringify({ digest: architectureDigest(payload), payload })
    )
  ) {
    const winner = readOpportunity(state, input.id);

    if (winner.inputDigest !== inputDigest) {
      throw new Error("Opportunity retry id already used with different input");
    }

    return winner;
  }

  return result;
}
/* oxlint-enable anti-slop/no-runtime-typeof */

export interface OpportunityInspection {
  readonly opportunity: ArchitectureOpportunity;
  readonly freshness: {
    readonly status: "current" | "stale";
    readonly staleAssessments: readonly string[];
  };
  readonly applicability: {
    readonly decision: OpportunityInput["decision"];
    readonly reasons: readonly string[];
  };
}

export function inspectOpportunity(
  root: string,
  state: string,
  id: string
): OpportunityInspection {
  const opportunity = readOpportunity(state, id);

  const staleAssessments = opportunity.assessments.flatMap((captured) => {
    const current = inspectAssessment(root, state, captured.assessment.id);

    return current.freshness.status === "stale" ? [current.assessment.id] : [];
  });

  const changed =
    staleAssessments.length > 0 ||
    JSON.stringify(opportunity.observation.manifest) !==
      JSON.stringify(manifest(root)) ||
    JSON.stringify(opportunity.observation.assets) !==
      JSON.stringify(assets()) ||
    opportunity.observation.configHash !==
      architectureDigest(readFileSync(join(state, "config.json")));

  return {
    applicability: {
      decision:
        changed && opportunity.decision === "refactor"
          ? "preparation"
          : opportunity.decision,
      reasons: changed
        ? [...opportunity.reasons, "Refresh supporting evidence before acting."]
        : opportunity.reasons,
    },
    freshness: { staleAssessments, status: changed ? "stale" : "current" },
    opportunity,
  };
}

function opportunityText(
  result: ReturnType<typeof inspectOpportunity>
): string {
  const record = result.opportunity;

  return [
    `Architecture opportunity ${record.id}`,
    `Captured recommendation: ${record.decision} (${record.strength}; proposed qualitative judgement)`,
    `Current applicability: ${result.applicability.decision}`,
    `Freshness: ${result.freshness.status}`,
    ...(result.freshness.status === "stale"
      ? [
          "Historical recommendation; refresh supporting evidence before acting.",
        ]
      : []),
    `Outcome: ${record.input.outcome}`,
    `Raw target: ${JSON.stringify(record.target)}`,
    `Missing dimensions: ${record.missingDimensions.join(", ") || "none"}`,
    ...result.applicability.reasons.map((reason) => `Readiness: ${reason}`),
    "The opportunity and its nested supporting freshness describe captured historical evidence; current applicability is checked separately.",
    "Opt-in existing-file exercise prepare/start/assess/complete is separate; a recommendation never starts it or grants exposure, practice or understanding. Workflow availability is captured at opportunity recording.",
    "Test readiness is reviewed evidence; this command does not execute tests.",
    JSON.stringify(record, null, 2),
  ].join("\n");
}

export function opportunityCommand(
  root: string,
  state: string,
  args: readonly string[]
): string {
  const [command, id] = args;

  if (command === "record") {
    return JSON.stringify(
      recordOpportunity(root, state, parseOpportunity(JSON.parse(id ?? "")))
    );
  }

  if ((command === "inspect" || command === "report") && id) {
    const result = inspectOpportunity(root, state, id);

    if (command === "report") {
      return JSON.stringify(
        writeArchitectureReport(
          state,
          `opportunity-${result.opportunity.id}`,
          "Architecture opportunity",
          opportunityText(result),
          JSON.stringify(result, null, 2),
          !args.includes("--no-open"),
          result.opportunity.assessments.map(
            (inspection) => inspection.assessment
          )
        )
      );
    }

    return args.includes("--json")
      ? JSON.stringify(result)
      : opportunityText(result);
  }

  throw new Error(
    "Usage: up architecture opportunity record <json> | inspect <id> [--json] | report <id> [--no-open]"
  );
}
