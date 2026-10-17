import type { ArchitectureModule, ArchitectureReview } from "./domain.ts";

export interface ExistingTest {
  readonly file: string;
  readonly name: string;
}

export interface TestabilityScenario {
  readonly id: string;
  readonly behaviour: string;
  readonly failureInvariant: string;
  readonly intendedInterface: string;
  readonly assertion: {
    readonly status: "reviewed" | "provisional";
    readonly kind: "observable-outcome" | "interaction-only";
    readonly throughInterface: boolean;
    readonly explanation: string;
    readonly evidence: readonly string[];
  };
  readonly dependency: {
    readonly kind:
      | "pure"
      | "local-substitute"
      | "owned-remote"
      | "true-external";
    readonly justification: string;
    readonly compatibilityRequired: boolean;
  };
  readonly tests: readonly ExistingTest[];
  readonly compatibility: readonly ExistingTest[];
}

export interface TestabilityAssessmentInput {
  readonly id: string;
  readonly dimension: "behavioural-testability";
  readonly module: ArchitectureModule;
  readonly scenarios: readonly TestabilityScenario[];
  readonly discovery: "complete" | "incomplete";
  readonly environmentRequirements: readonly string[];
  readonly review: ArchitectureReview;
  readonly evidence: readonly string[];
  readonly exclusions: readonly string[];
  readonly limitations: readonly string[];
}

export interface TestExecution {
  readonly test: ExistingTest;
  readonly command: readonly string[];
  readonly status: "passed" | "failed" | "skipped" | "missing" | "unavailable";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly diagnostic: string;
}

export interface TestabilityAnalysis {
  readonly kind: "testability";
  readonly environment: { readonly node: string; readonly platform: string };
  readonly results: readonly {
    readonly scenarioId: string;
    readonly checks: readonly TestExecution[];
    readonly compatibility: readonly TestExecution[];
  }[];
}

export interface TestabilityScenarioMeasurement {
  readonly id: string;
  readonly status: "qualifying" | "gap" | "failed" | "skipped" | "unavailable";
  readonly reason: string;
}

export interface TestabilityMeasurements {
  readonly status: "measured" | "unavailable";
  readonly value: number | null;
  readonly denominator: number;
  readonly assessed: number;
  readonly qualifying: number;
  readonly scenarios: readonly TestabilityScenarioMeasurement[];
}

function scenarioMeasurement(
  scenario: TestabilityScenario,
  analysis: TestabilityAnalysis | undefined
): TestabilityScenarioMeasurement {
  const result = analysis?.results.find(
    (candidate) => candidate.scenarioId === scenario.id
  );

  const outcome = (
    status: TestabilityScenarioMeasurement["status"],
    reason: string
  ): TestabilityScenarioMeasurement => ({ id: scenario.id, reason, status });

  if (!scenario.tests.length) {
    return outcome("gap", "Agreed scenario has no existing test");
  }

  if (
    !result ||
    result.checks.length !== scenario.tests.length ||
    result.compatibility.length !== scenario.compatibility.length
  ) {
    return outcome("unavailable", "Missing CLI-owned execution evidence");
  }

  const checks = [...result.checks, ...result.compatibility];

  if (checks.some((check) => check.status === "unavailable")) {
    return outcome(
      "unavailable",
      "Execution or selected-case discovery unavailable"
    );
  }

  if (checks.some((check) => check.status === "missing")) {
    return outcome(
      "gap",
      "Referenced existing test has been removed or is missing"
    );
  }

  if (checks.some((check) => check.status === "failed")) {
    return outcome("failed", "Relevant test or compatibility check failed");
  }

  if (checks.some((check) => check.status === "skipped")) {
    return outcome("skipped", "Relevant test or compatibility check skipped");
  }

  if (
    scenario.assertion.status !== "reviewed" ||
    scenario.assertion.kind !== "observable-outcome" ||
    !scenario.assertion.throughInterface ||
    !scenario.assertion.evidence.length
  ) {
    return outcome(
      "gap",
      "Reviewed observable-outcome assertion through intended interface missing"
    );
  }

  const compatibilityRequired =
    scenario.dependency.compatibilityRequired ||
    scenario.dependency.kind === "owned-remote" ||
    scenario.dependency.kind === "true-external";

  if (compatibilityRequired && !scenario.compatibility.length) {
    return outcome("gap", "Necessary production compatibility checks missing");
  }

  return outcome(
    "qualifying",
    "Selected execution passed with reviewed outcome and justified dependency strategy"
  );
}

export function testabilityMeasurements(
  input: TestabilityAssessmentInput,
  analysis: TestabilityAnalysis | undefined
): TestabilityMeasurements {
  const scenarios = input.scenarios.map((scenario) =>
    scenarioMeasurement(scenario, analysis)
  );

  const qualifying = scenarios.filter(
    (scenario) => scenario.status === "qualifying"
  ).length;

  const assessed = scenarios.filter(
    (scenario) => scenario.status !== "unavailable"
  ).length;

  const measured =
    scenarios.length > 0 &&
    assessed === scenarios.length &&
    input.discovery === "complete";

  return {
    assessed,
    denominator: scenarios.length,
    qualifying,
    scenarios,
    status: measured ? "measured" : "unavailable",
    value: measured ? qualifying / scenarios.length : null,
  };
}

export function testabilityEvidence(
  input: TestabilityAssessmentInput
): string[] {
  return input.scenarios.flatMap((scenario) => [
    scenario.intendedInterface,
    ...scenario.assertion.evidence,
  ]);
}

export function testabilityLimitations(
  input: TestabilityAssessmentInput,
  analysis: TestabilityAnalysis | undefined
): string[] {
  const measurements = testabilityMeasurements(input, analysis);

  return [
    ...measurements.scenarios
      .filter((scenario) => scenario.status !== "qualifying")
      .map(
        (scenario) => `${scenario.id}: ${scenario.status}; ${scenario.reason}`
      ),
    ...(input.discovery === "incomplete"
      ? ["Scenario discovery incomplete; aggregate unavailable"]
      : []),
    ...(input.scenarios.length
      ? []
      : ["No agreed scenarios; zero denominator unavailable"]),
    "Experimental reviewed testability; this fraction does not prove overall correctness or safety",
  ];
}
