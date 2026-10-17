import type { ArchitectureModule, ManifestEntry } from "./domain.ts";

export interface DependencyRule {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: "public-only" | "forbidden";
  readonly dependency: "all" | "runtime" | "type-only";
}

export interface CycleException {
  readonly id: string;
  readonly modules: readonly string[];
  readonly reason: string;
}

export interface CyclePolicy {
  readonly id: string;
  readonly dependency: "all" | "runtime" | "type-only";
  readonly exceptions: readonly CycleException[];
}

export interface CycleStep {
  readonly from: string;
  readonly to: string;
  readonly edge: DependencyEdge;
}

export interface CycleGroup {
  readonly modules: readonly string[];
  readonly path: readonly CycleStep[];
  readonly policyId: string;
  readonly dependency: CyclePolicy["dependency"];
  readonly permittedBy: string | null;
}

export interface SeamAssessmentInput {
  readonly id: string;
  readonly dimension: "seam-integrity";
  readonly modules: readonly ArchitectureModule[];
  readonly rules: readonly DependencyRule[];
  readonly cycles?: CyclePolicy;
  readonly evidence: readonly string[];
  readonly exclusions: readonly string[];
  readonly limitations: readonly string[];
}

export interface DependencyEdge {
  readonly source: string;
  readonly destination: string;
  readonly specifier: string;
  readonly kind: "runtime" | "type-only" | "external" | "unresolved";
  readonly dynamic: boolean;
  readonly typeOnly: boolean;
  readonly reexport: boolean;
  readonly opaqueExport?: true;
  readonly line: number | null;
}

export interface SeamFinding {
  readonly ruleId: string;
  readonly source: string;
  readonly destination: string;
  readonly line: number | null;
  readonly kind:
    | "private-import"
    | "forbidden-direction"
    | "interface-reexport"
    | "prohibited-cycle";
  readonly dependency: DependencyEdge["kind"];
  readonly description: string;
}

export interface AnalyserTool {
  readonly directory: string;
  readonly fingerprint: string;
  readonly assets: readonly ManifestEntry[];
  readonly version: "dependency-cruiser@18.6.0/typescript@5.9.3";
}

export interface SeamAnalysis {
  readonly status: "complete" | "partial" | "unavailable";
  readonly edges: readonly DependencyEdge[];
  readonly findings: readonly SeamFinding[];
  readonly eligibleEdges: number;
  readonly analysedFiles: readonly string[];
  readonly limitations: readonly string[];
  readonly tool: AnalyserTool | null;
  readonly cycles?: readonly CycleGroup[];
}

export interface SeamMeasurements {
  readonly status: "measured" | "unavailable" | "not-applicable";
  readonly value: null;
  readonly denominator: number;
  readonly assessed: number;
  readonly violations: number;
  readonly eligibleEdges: number;
  readonly cyclicGroups?: number;
}
