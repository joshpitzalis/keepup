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
    readiness: "requires-preparation",
    requirements: [
      "Reviewed concrete caller obligation, frozen representative scenarios, source/caller ownership improvement and unchanged behavioural tests; existing-file scope",
    ],
    route: "architecture-exercise",
    supported: true,
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
      "Reviewed equivalent policy sites, preserved trust boundaries, source improvement and behavioural tests; existing-file scope",
    ],
    route: "architecture-exercise",
    supported: true,
  },
  {
    dimension: "navigability",
    readiness: "requires-preparation",
    requirements: [
      "Same exact question, owner and original trail, reviewed shorter coherent implementation trail and unchanged callers/regressions; existing-file scope",
    ],
    route: "architecture-exercise",
    supported: true,
  },
  {
    dimension: "behavioural-testability",
    readiness: "requires-preparation",
    requirements: [
      "Reviewed unsupported scenario, prepared learner-authored positive/negative tests and required compatibility checks, separate additional execution and immutable original regressions; new paths require frozen learning mappings",
    ],
    route: "architecture-exercise",
    supported: true,
  },
] as const;
