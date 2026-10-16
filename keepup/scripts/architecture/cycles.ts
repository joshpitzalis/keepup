import type {
  CycleGroup,
  CyclePolicy,
  CycleStep,
  DependencyEdge,
  SeamAssessmentInput,
  SeamFinding,
} from "./seam-domain.ts";

type ModuleGraph = ReadonlyMap<string, readonly CycleStep[]>;

function moduleGraph(
  input: SeamAssessmentInput,
  edges: readonly DependencyEdge[],
  policy: CyclePolicy
): ModuleGraph {
  const owners = new Map(
    input.modules.flatMap((module) =>
      module.members.map((file) => [file, module.id])
    )
  );

  const graph = new Map<string, CycleStep[]>();

  for (const edge of edges.toSorted((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  )) {
    const from = owners.get(edge.source);
    const to = owners.get(edge.destination);

    if (
      !from ||
      !to ||
      from === to ||
      edge.kind === "external" ||
      edge.kind === "unresolved" ||
      (policy.dependency !== "all" && policy.dependency !== edge.kind)
    ) {
      continue;
    }

    const steps = graph.get(from) ?? [];

    if (!steps.some((step) => step.to === to)) {
      steps.push({ edge, from, to });
    }

    graph.set(from, steps);
  }

  for (const steps of graph.values()) {
    steps.sort((left, right) => left.to.localeCompare(right.to));
  }

  return graph;
}

function reachable(graph: ModuleGraph, start: string): ReadonlySet<string> {
  const found = new Set([start]);
  const pending = [start];

  for (const current of pending) {
    for (const step of graph.get(current) ?? []) {
      if (found.has(step.to)) {
        continue;
      }

      found.add(step.to);
      pending.push(step.to);
    }
  }

  return found;
}

function reverseGraph(graph: ModuleGraph): ModuleGraph {
  const reversed = new Map<string, CycleStep[]>();

  for (const steps of graph.values()) {
    for (const step of steps) {
      const values = reversed.get(step.to) ?? [];
      values.push({ ...step, from: step.to, to: step.from });
      reversed.set(step.to, values);
    }
  }

  return reversed;
}

function components(
  graph: ModuleGraph,
  modules: readonly string[]
): string[][] {
  const reverse = reverseGraph(graph);
  const assigned = new Set<string>();
  const groups: string[][] = [];

  // shortcut: repeated reachability suits small declared module inventories; use linear SCC traversal for large inventories.
  for (const module of modules) {
    if (assigned.has(module)) {
      continue;
    }

    const forward = reachable(graph, module);
    const backward = reachable(reverse, module);
    const group = modules.filter((id) => forward.has(id) && backward.has(id));

    for (const id of group) {
      assigned.add(id);
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

function pathBetween(
  graph: ModuleGraph,
  allowed: ReadonlySet<string>,
  start: string,
  end: string
): CycleStep[] {
  if (start === end) {
    return [];
  }

  const queue: { readonly module: string; readonly path: CycleStep[] }[] = [
    { module: start, path: [] },
  ];

  const visited = new Set([start]);

  for (const current of queue) {
    for (const step of graph.get(current.module) ?? []) {
      if (!allowed.has(step.to) || visited.has(step.to)) {
        continue;
      }

      const path = [...current.path, step];

      if (step.to === end) {
        return path;
      }

      visited.add(step.to);
      queue.push({ module: step.to, path });
    }
  }

  throw new Error("Cycle evidence path missing; graph is inconsistent");
}

function cyclePath(
  graph: ModuleGraph,
  modules: readonly string[]
): CycleStep[] {
  const [first] = modules;

  if (!first) {
    return [];
  }

  const allowed = new Set(modules);
  const path: CycleStep[] = [];
  let current = first;

  for (const target of [...modules.slice(1), first]) {
    path.push(...pathBetween(graph, allowed, current, target));
    current = target;
  }

  return path;
}

export function analyseCycles(
  input: SeamAssessmentInput,
  edges: readonly DependencyEdge[]
): readonly CycleGroup[] {
  const policy = input.cycles;

  if (!policy) {
    return [];
  }

  const graph = moduleGraph(input, edges, policy);
  const modules = input.modules.map((module) => module.id).toSorted();

  return components(graph, modules).map((group) => ({
    dependency: policy.dependency,
    modules: group,
    path: cyclePath(graph, group),
    permittedBy:
      policy.exceptions.find(
        (exception) =>
          JSON.stringify(exception.modules) === JSON.stringify(group)
      )?.id ?? null,
    policyId: policy.id,
  }));
}

export function cycleFindings(
  groups: readonly CycleGroup[]
): readonly SeamFinding[] {
  return groups.flatMap((group) => {
    if (group.permittedBy !== null) {
      return [];
    }

    const [first] = group.path;

    if (!first) {
      throw new Error("Cyclic group has no explanatory edge");
    }

    const modulePath = [first.from, ...group.path.map((step) => step.to)].join(
      " -> "
    );

    return [
      {
        dependency: first.edge.kind,
        description: `Prohibited cyclic module group [${group.modules.join(", ")}]: ${modulePath}; one finding per strongly connected group`,
        destination: first.edge.destination,
        kind: "prohibited-cycle",
        line: first.edge.line,
        ruleId: group.policyId,
        source: first.edge.source,
      },
    ];
  });
}
