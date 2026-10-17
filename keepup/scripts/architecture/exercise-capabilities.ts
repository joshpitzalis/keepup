export const exerciseCapabilities = [
  {
    dimension: "file-health",
    readiness: "requires-preparation",
    requirements: [
      "Available improving condition metric, clean bounded scope and existing behavioural tests",
    ],
    route: "ordinary-kata",
    supported: true,
  },
  {
    dimension: "interface-leverage",
    readiness: "unsupported",
    requirements: [
      "Assess the concrete caller obligation; installed completion is unavailable",
    ],
    route: null,
    supported: false,
  },
  {
    dimension: "seam-integrity",
    readiness: "requires-preparation",
    requirements: [
      "Complete supported graph, frozen rule/cycle target, scope and behavioural tests",
    ],
    route: "architecture-exercise",
    supported: true,
  },
  {
    dimension: "change-locality",
    readiness: "requires-preparation",
    requirements: [
      "Reviewed equivalent policy sites, preserved trust boundaries, source improvement and behavioural tests; existing-file scope without graph guardrails",
    ],
    route: "architecture-exercise",
    supported: true,
  },
  {
    dimension: "navigability",
    readiness: "unsupported",
    requirements: [
      "Assess the fixed comprehension question and readable trail; installed completion is unavailable",
    ],
    route: null,
    supported: false,
  },
  {
    dimension: "behavioural-testability",
    readiness: "unsupported",
    requirements: [
      "Assess the missing outcome scenario and compatibility checks; installed completion is unavailable",
    ],
    route: null,
    supported: false,
  },
] as const;
