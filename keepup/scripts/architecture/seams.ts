import {
  acquireGraph,
  analyserTool,
  trackedDependencySources,
} from "./analyser.ts";
import type {
  DependencyEdge,
  SeamAnalysis,
  SeamAssessmentInput,
  SeamFinding,
  SeamMeasurements,
  DependencyRule,
} from "./seam-domain.ts";

function applies(
  kind: DependencyEdge["kind"],
  dependency: "all" | "runtime" | "type-only"
): boolean {
  return dependency === "all" || dependency === kind;
}

interface EvaluatedRules {
  readonly findings: SeamFinding[];
  readonly eligibleEdges: number;
}

interface RuleViolation {
  readonly kind: SeamFinding["kind"];
  readonly description: string;
}

function ruleViolation(
  input: SeamAssessmentInput,
  rule: DependencyRule,
  edge: DependencyEdge,
  from: string,
  to: string
): RuleViolation | null {
  const target = input.modules.find((module) => module.id === to);
  const privateDestination = !target?.interface.includes(edge.destination);

  if (
    rule.kind === "public-only" &&
    from === to &&
    edge.reexport &&
    target?.interface.includes(edge.source) &&
    privateDestination
  ) {
    return {
      description:
        "Public interface re-exports private implementation; explicitly declare exported implementation in intended interface before comparison",
      kind: "interface-reexport",
    };
  }

  if (rule.from !== from || from === to) {
    return null;
  }

  if (rule.kind === "forbidden") {
    return {
      description: `Forbidden dependency direction ${from} -> ${to}`,
      kind: "forbidden-direction",
    };
  }

  return privateDestination
    ? {
        description: `Consumer bypasses intended interface of ${to}`,
        kind: "private-import",
      }
    : null;
}

function evaluateRules(
  input: SeamAssessmentInput,
  edges: readonly DependencyEdge[]
): EvaluatedRules {
  const owners = new Map(
    input.modules.flatMap((module) =>
      module.members.map((file) => [file, module.id])
    )
  );

  const findings: SeamFinding[] = [];
  let eligibleEdges = 0;

  for (const edge of edges) {
    const from = owners.get(edge.source);
    const to = owners.get(edge.destination);

    if (
      !from ||
      !to ||
      edge.kind === "external" ||
      edge.kind === "unresolved"
    ) {
      continue;
    }

    if (from !== to) {
      eligibleEdges += 1;
    }

    for (const rule of input.rules) {
      if (!applies(edge.kind, rule.dependency) || rule.to !== to) {
        continue;
      }

      const violation = ruleViolation(input, rule, edge, from, to);

      if (!violation) {
        continue;
      }

      const { kind, description } = violation;
      findings.push({
        dependency: edge.kind,
        description,
        destination: edge.destination,
        kind,
        line: edge.line,
        ruleId: rule.id,
        source: edge.source,
      });
    }
  }

  return {
    eligibleEdges,
    findings: findings.toSorted((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    ),
  };
}

export function analyseSeams(
  root: string,
  input: SeamAssessmentInput,
  directory: string | undefined
): SeamAnalysis {
  let tool: SeamAnalysis["tool"] = null;

  try {
    if (!directory) {
      throw new Error(
        "Set KEEPUP_ANALYSER_DIRECTORY to explicit pinned dependency-cruiser@18.6.0/typescript@5.9.3 installation; no tools installed automatically"
      );
    }

    tool = analyserTool(directory);

    const declared = new Set(input.modules.flatMap((module) => module.members));
    const sources = trackedDependencySources(root);
    const acquired = acquireGraph(root, sources, tool);

    const unownedConsumers = acquired.edges
      .filter(
        (edge) => !declared.has(edge.source) && declared.has(edge.destination)
      )
      .map(
        (edge) =>
          `Unowned consumer ${edge.source} -> ${edge.destination}; declare caller membership/rules for complete target coverage`
      );

    const graph = {
      ...acquired,
      limitations: [
        ...acquired.limitations,
        ...unownedConsumers,
        ...(input.rules.length
          ? []
          : ["No dependency rules declared; seam coverage is unavailable"]),
      ],
    };

    const evaluated = evaluateRules(input, graph.edges);

    if (analyserTool(directory).fingerprint !== tool.fingerprint) {
      throw new Error("Analyser assets changed during analysis; retry");
    }

    return {
      ...evaluated,
      ...graph,
      status: graph.limitations.length ? "partial" : "complete",
      tool,
    };
  } catch (error) {
    return {
      analysedFiles: [],
      edges: [],
      eligibleEdges: 0,
      findings: [],
      limitations: [error instanceof Error ? error.message : String(error)],
      status: "unavailable",
      tool,
    };
  }
}

export function seamMeasurements(analysis: SeamAnalysis): SeamMeasurements {
  let status: SeamMeasurements["status"] = "unavailable";

  if (analysis.status === "complete") {
    status = analysis.eligibleEdges ? "measured" : "not-applicable";
  }

  return {
    assessed: analysis.eligibleEdges,
    denominator: analysis.eligibleEdges,
    eligibleEdges: analysis.eligibleEdges,
    status,
    value: null,
    violations: analysis.findings.length,
  };
}
