import type { StoredEvent } from "../keepup.ts";
import type { ArchitectureAssessment, ManifestEntry } from "./domain.ts";
import type { SeamFinding } from "./seam-domain.ts";
import type { ExistingTest, TestExecution } from "./testability.ts";

export interface ExerciseHost {
  readonly events: () => readonly StoredEvent[];
  readonly learner: () => string;
  readonly files: () => readonly string[];
  readonly config: () => { readonly testCommand: string | null };
  readonly now: () => string;
  readonly locked: <T>(action: () => T) => T;
}

export type ExerciseTarget =
  | {
      readonly kind: Exclude<SeamFinding["kind"], "prohibited-cycle">;
      readonly ruleId: string;
      readonly source: string;
      readonly destination: string;
      readonly goal: 0;
    }
  | {
      readonly kind: "prohibited-cycle";
      readonly ruleId: string;
      readonly modules: readonly string[];
      readonly goal: 0;
    };

export interface ExerciseGuardrail {
  readonly ruleId: string;
  readonly kind: SeamFinding["kind"];
}

export interface ExercisePreparationInput {
  readonly id: string;
  readonly assessmentId: string;
  readonly files: readonly string[];
  readonly callers: readonly string[];
  readonly technique: string;
  readonly behaviour: string;
  readonly target: ExerciseTarget;
  readonly concepts: readonly {
    readonly file: string;
    readonly concept: string;
  }[];
  readonly invariants: readonly string[];
  readonly requiredTests: readonly ExistingTest[];
  readonly guardrails: readonly ExerciseGuardrail[];
  readonly tradeoffs: readonly string[];
  readonly stopCondition: string;
}

export interface ExerciseInventory {
  readonly revision: string | null;
  readonly manifest: readonly ManifestEntry[];
  readonly untracked: readonly ManifestEntry[];
  readonly assets: readonly ManifestEntry[];
  readonly hostAssets: readonly ManifestEntry[];
  readonly runtime: string;
  readonly configHash: string;
  readonly environmentHash: string;
}

export interface ExerciseTestRun {
  readonly command: string;
  readonly exitCode: 0;
  readonly stdout: string;
  readonly stderr: string;
  readonly tests: number;
  readonly witnesses: readonly TestExecution[];
}

export interface ExercisePreparation {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly input: ExercisePreparationInput;
  readonly inputDigest: string;
  readonly learner: string;
  readonly time: string;
  readonly quizPrefix: string;
  readonly assessment: ArchitectureAssessment;
  readonly inventory: ExerciseInventory;
  readonly targetBaseline: number;
  readonly guardrails: readonly {
    readonly ruleId: string;
    readonly kind: SeamFinding["kind"];
    readonly baseline: number;
  }[];
  readonly tests: ExerciseTestRun;
}

export interface ExerciseStartInput {
  readonly id: string;
  readonly exerciseId: string;
  readonly preQuizIds: readonly string[];
}

export interface ExerciseStart {
  readonly schemaVersion: 1;
  readonly input: ExerciseStartInput;
  readonly inputDigest: string;
  readonly learner: string;
  readonly time: string;
  readonly quizzes: readonly StoredEvent[];
  readonly tests: ExerciseTestRun;
}

export interface ExerciseLifecycleInput {
  readonly id: string;
  readonly exerciseId: string;
  readonly reason: string;
}

export interface ExerciseLifecycle {
  readonly schemaVersion: 1;
  readonly type: "abandon" | "submission-pending";
  readonly input: ExerciseLifecycleInput;
  readonly inputDigest: string;
  readonly learner: string;
  readonly time: string;
}

export interface ArchitectureExercise {
  readonly preparation: ExercisePreparation;
  readonly start: ExerciseStart | null;
  readonly abandonment: ExerciseLifecycle | null;
  readonly submissions: readonly ExerciseLifecycle[];
  readonly state: "prepared" | "active" | "submission-pending" | "abandoned";
}
