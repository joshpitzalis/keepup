import type {
  LocalityAssessmentInput,
  LocalityMeasurements,
} from "./locality.ts";
import type {
  SeamAnalysis,
  SeamAssessmentInput,
  SeamMeasurements,
} from "./seam-domain.ts";
import type {
  TestabilityAssessmentInput,
  TestabilityMeasurements,
  TestabilityAnalysis,
} from "./testability.ts";

export interface ArchitectureModule {
  readonly id: string;
  readonly members: readonly string[];
  readonly interface: readonly string[];
}

export interface ArchitectureReview {
  readonly status: "provisional" | "reviewed";
  readonly reviewer: string;
  readonly confidence: "low" | "medium" | "high";
  readonly notes: string;
}

export interface CallerObligation {
  readonly kind:
    | "operations"
    | "arguments"
    | "ordering"
    | "configuration"
    | "errors";
  readonly classification: "domain" | "avoidable";
  readonly description: string;
  readonly evidence: readonly string[];
}

export interface InterfaceScenario {
  readonly id: string;
  readonly description: string;
  readonly rating: 0 | 0.5 | 1 | null;
  readonly rationale: string;
  readonly evidence: readonly string[];
  readonly obligations: readonly CallerObligation[];
}

export interface InterfaceAssessmentInput {
  readonly id: string;
  readonly dimension: "interface-leverage";
  readonly module: ArchitectureModule;
  readonly scenarios: readonly InterfaceScenario[];
  readonly review: ArchitectureReview;
  readonly evidence: readonly string[];
  readonly exclusions: readonly string[];
  readonly limitations: readonly string[];
}

export type AssessmentInput =
  | InterfaceAssessmentInput
  | SeamAssessmentInput
  | LocalityAssessmentInput
  | TestabilityAssessmentInput;

export interface InterfaceMeasurements {
  readonly status: "measured" | "unavailable" | "not-applicable";
  readonly value: number | null;
  readonly denominator: number;
  readonly assessed: number;
  readonly domainObligations: number;
  readonly avoidableObligations: number;
}

export type AssessmentMeasurements =
  | InterfaceMeasurements
  | SeamMeasurements
  | LocalityMeasurements
  | TestabilityMeasurements;

export interface ManifestEntry {
  readonly path: string;
  readonly hash: string | null;
}

export interface ArchitectureAssessment {
  readonly analysis?: SeamAnalysis | TestabilityAnalysis;
  readonly schemaVersion: 1;
  readonly id: string;
  readonly dimension: AssessmentInput["dimension"];
  readonly method: "reviewed" | "automated";
  readonly input: AssessmentInput;
  readonly inputDigest: string;
  readonly measurements: AssessmentMeasurements;
  readonly limitations: readonly string[];
  readonly coverage: { readonly assessed: number; readonly total: number };
  readonly observation: {
    readonly id: string;
    readonly time: string;
    readonly revision: string | null;
    readonly observer: string;
    readonly manifest: readonly ManifestEntry[];
    readonly assets: readonly ManifestEntry[];
    readonly rubric: string;
  };
}

export interface ArchitectureInspection {
  readonly assessment: ArchitectureAssessment;
  readonly freshness: {
    readonly status: "current" | "stale";
    readonly changed: readonly string[];
  };
}
