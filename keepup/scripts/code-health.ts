import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import type { ArchitectureInspection } from "./architecture/domain.ts";
import { strings } from "./architecture/parse-common.ts";
import { inspectAssessment, manifest } from "./architecture/storage.ts";
import type { Status } from "./keepup.ts";

const ARCHITECTURE_DIMENSIONS = [
  "interface-leverage",
  "seam-integrity",
  "change-locality",
  "navigability",
  "behavioural-testability",
] as const;

function assessmentValue(inspection: ArchitectureInspection): number | null {
  const { assessment, freshness } = inspection;

  if (freshness.status !== "current") {
    return null;
  }

  if (assessment.input.dimension !== "seam-integrity") {
    return assessment.measurements.status === "measured"
      ? assessment.measurements.value
      : null;
  }

  const { analysis } = assessment;

  if (
    !analysis ||
    !("edges" in analysis) ||
    analysis.status !== "complete" ||
    !assessment.input.cycles ||
    !analysis.cycles ||
    !assessment.input.rules.length
  ) {
    return null;
  }

  const boundaries = analysis.findings.filter(
    (finding) => finding.kind !== "prohibited-cycle"
  ).length;

  const cycles = analysis.cycles.filter(
    (group) => group.permittedBy === null
  ).length;

  return (1 / (1 + boundaries) + 1 / (1 + cycles)) / 2;
}

export function codeHealth(
  root: string,
  state: string,
  measure: () => Status,
  suppliedIds?: readonly string[]
) {
  const planPath = join(state, "health-plan.json");

  const ids =
    suppliedIds ??
    (existsSync(planPath)
      ? strings(JSON.parse(readFileSync(planPath, "utf-8")))
      : []);

  if (new Set(ids).size !== ids.length) {
    throw new Error("Code health requires distinct assessment IDs");
  }

  const before = manifest(root);
  const status = measure();

  const sourceFiles = status.files
    .filter((file) =>
      /\.(?:[cm]?[jt]sx?|py|go|rs|rb|php|java|kt|cs|c|cpp|h|hpp|swift)$/u.test(
        file.file
      )
    )
    .map((file) => file.file);

  const inspections = ids.map((id) => inspectAssessment(root, state, id));

  const dimensions = ARCHITECTURE_DIMENSIONS.map((dimension) => {
    const selected = inspections.filter(
      (item) => item.assessment.dimension === dimension
    );

    const owners = selected.map((item) =>
      item.assessment.input.dimension === "seam-integrity"
        ? "dependency-graph"
        : item.assessment.input.module.id
    );

    if (new Set(owners).size !== owners.length) {
      throw new Error(
        `Code health cannot double-count a module in ${dimension}; select one current assessment per module`
      );
    }

    const values = selected.map(assessmentValue);

    const members = selected
      .flatMap((item) =>
        item.assessment.input.dimension === "seam-integrity"
          ? item.assessment.input.modules.flatMap((module) => module.members)
          : item.assessment.input.module.members
      )
      .map((file) => resolve(root, file));

    const covered = new Set(members);

    if (covered.size !== members.length) {
      throw new Error(
        `Code health cannot double-count overlapping source membership in ${dimension}`
      );
    }

    const unassessedFiles = sourceFiles.filter(
      (file) => !covered.has(resolve(root, file))
    );

    const complete =
      values.length > 0 &&
      values.every((value) => value !== null) &&
      unassessedFiles.length === 0;

    return {
      assessments: selected.map((item) => ({
        freshness: item.freshness,
        id: item.assessment.id,
        measurements: item.assessment.measurements,
        provisional:
          "review" in item.assessment.input &&
          item.assessment.input.review.status === "provisional",
      })),
      dimension,
      unassessedFiles,
      value: complete
        ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) /
          values.length
        : null,
    };
  });

  const scores = [
    status.summary.codeHealth,
    ...dimensions.map((dimension) => dimension.value),
  ];

  const available = scores.filter((score): score is number => score !== null);
  const warnings = [...status.warnings];

  if (available.length !== 6) {
    warnings.push(
      `${available.length}/6 dimensions measured; the combined score is partial, not a complete codebase assessment`
    );
  }

  for (const dimension of dimensions) {
    if (dimension.unassessedFiles.length) {
      warnings.push(
        `${dimension.dimension}: ${dimension.unassessedFiles.length} source files outside assessment membership`
      );
    }

    if (dimension.assessments.some((assessment) => assessment.provisional)) {
      warnings.push(
        `${dimension.dimension}: contains provisional agent judgments; the score is advisory`
      );
    }
  }

  if (JSON.stringify(before) !== JSON.stringify(manifest(root))) {
    throw new Error(
      "Source changed during code-health aggregation; retry when edits settle"
    );
  }

  const report = {
    assessedDimensions: available.length,
    codeHealth: available.length
      ? available.reduce((sum, score) => sum + score, 0) / available.length
      : null,
    complete:
      available.length === 6 &&
      status.files
        .filter((file) => sourceFiles.includes(file.file))
        .every((file) => file.codeScore !== null) &&
      dimensions.every((dimension) => dimension.unassessedFiles.length === 0),
    comprehensionDebt: status.summary.cognitiveDebt,
    dimensions: [
      {
        assessments: [],
        dimension: "file-health",
        unassessedFiles: status.files
          .filter((file) => file.codeScore === null)
          .map((file) => file.file),
        value: status.summary.codeHealth,
      },
      ...dimensions,
    ],
    fileCoverage: status.summary.scoredLineCoverage,
    fileMetrics: status.metrics,
    files: status.files.map(({ file, lines, metrics, codeScore }) => ({
      codeScore,
      file,
      lines,
      metrics,
    })),
    formula: "equal-dimension-mean-v1",
    source: before,
    time: new Date().toISOString(),
    totalDimensions: 6,
    warnings,
  };

  const directory = join(state, "health");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${randomUUID()}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });

  if (suppliedIds) {
    const temporary = join(state, `health-plan-${randomUUID()}.tmp`);
    writeFileSync(temporary, `${JSON.stringify(ids)}\n`, { flag: "wx" });
    renameSync(temporary, planPath);
  }

  return { ...report, path };
}
