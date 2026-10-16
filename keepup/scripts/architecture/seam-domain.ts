import type { ArchitectureModule, ManifestEntry } from "./domain.ts";

export interface DependencyRule {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: "public-only" | "forbidden";
  readonly dependency: "all" | "runtime" | "type-only";
}

export interface SeamAssessmentInput {
  readonly id: string;
  readonly dimension: "seam-integrity";
  readonly modules: readonly ArchitectureModule[];
  readonly rules: readonly DependencyRule[];
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
    | "interface-reexport";
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
}

export interface SeamMeasurements {
  readonly status: "measured" | "unavailable" | "not-applicable";
  readonly value: null;
  readonly denominator: number;
  readonly assessed: number;
  readonly violations: number;
  readonly eligibleEdges: number;
}
