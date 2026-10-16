import { isUtf8 } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  ArchitectureAssessment,
  ArchitectureInspection,
  AssessmentMeasurements,
} from "./domain.ts";
import { referencedPaths } from "./storage.ts";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function measurementText(measurements: AssessmentMeasurements): string[] {
  if ("qualifying" in measurements) {
    return [
      `Qualifying scenarios: ${measurements.qualifying}/${measurements.denominator}`,
      ...measurements.scenarios.map(
        (scenario) => `${scenario.id}: ${scenario.status}; ${scenario.reason}`
      ),
    ];
  }

  if ("independentPolicySites" in measurements) {
    return [
      `Independent policy sites: ${measurements.independentPolicySites}; calls: ${measurements.calls}; confirmed rules: ${measurements.denominator}`,
      `Proposed rules: ${measurements.proposedRules}; unclear rules: ${measurements.unclearRules}`,
      "Affected owners and trust boundaries remain separate from locality score; see reviewed inventory below",
    ];
  }

  if ("violations" in measurements) {
    return [
      `Violations: ${measurements.violations}; eligible edges: ${measurements.eligibleEdges}`,
    ];
  }

  return [
    `Caller obligations: domain ${measurements.domainObligations}; avoidable ${measurements.avoidableObligations}`,
  ];
}

export function architectureText(result: ArchitectureInspection): string {
  const { assessment, freshness } = result;
  const { measurements, input } = assessment;

  if (input.dimension === "seam-integrity" && "violations" in measurements) {
    return [
      `Architecture ${assessment.id}: seam-integrity (automated)`,
      `Modules: ${input.modules.map((module) => module.id).join(", ")}; freshness: ${freshness.status}`,
      `Violations: ${measurements.violations}; eligible edges: ${measurements.eligibleEdges}; coverage: ${assessment.analysis && "status" in assessment.analysis ? assessment.analysis.status : "unavailable"}`,
      `Rubric: ${assessment.observation.rubric} (experimental); raw violations are targets, no architecture grade`,
      ...assessment.limitations.map(
        (limitation) => `Limitation: ${limitation}`
      ),
      ...freshness.changed.map(
        (file) => `Changed supporting evidence: ${file}`
      ),
      JSON.stringify(assessment.analysis, null, 2),
      JSON.stringify(input, null, 2),
    ].join("\n");
  }

  if (input.dimension === "seam-integrity" || "violations" in measurements) {
    throw new Error("Unexpected architecture dimension");
  }

  return [
    `Architecture ${assessment.id}: ${assessment.dimension} (${assessment.method}, ${input.review.status})`,
    `Module: ${input.module.id}; freshness: ${freshness.status}`,
    `Value: ${measurements.value ?? "unavailable"}; assessed ${measurements.assessed}/${measurements.denominator}`,
    ...measurementText(measurements),
    `Rubric: ${assessment.observation.rubric} (experimental)`,
    ...assessment.limitations.map((limitation) => `Limitation: ${limitation}`),
    ...freshness.changed.map((file) => `Changed supporting evidence: ${file}`),
    JSON.stringify(assessment.input, null, 2),
  ].join("\n");
}

export interface ArchitectureReportResult {
  readonly path: string;
  readonly opened: boolean;
  readonly warnings: string[];
}

export function architectureReport(
  state: string,
  result: ArchitectureInspection,
  open: boolean
): ArchitectureReportResult {
  return writeArchitectureReport(
    state,
    result.assessment.id,
    "Architecture assessment",
    architectureText(result),
    JSON.stringify(result, null, 2),
    open,
    [result.assessment]
  );
}

function capturedEvidence(
  state: string,
  assessment: ArchitectureAssessment
): string {
  const paths = new Set(referencedPaths(assessment.input));

  const sources = assessment.observation.manifest.filter((entry) =>
    paths.has(entry.path)
  );

  const rubrics = assessment.observation.assets.filter(
    (entry) => entry.path === `${assessment.dimension}-rubric.md`
  );

  return [...sources, ...rubrics]
    .map((entry) => {
      const kind = sources.includes(entry) ? "source" : "rubric";
      const label = `Captured ${kind} ${assessment.id}: ${entry.path}`;

      if (entry.hash === null) {
        return `<details><summary>${escapeHtml(label)}</summary><p>Captured bytes unavailable.</p></details>`;
      }

      const bytes = readFileSync(
        join(state, "architecture", "snapshots", entry.hash)
      );

      const content = isUtf8(bytes)
        ? `<pre>${escapeHtml(bytes.toString("utf-8"))}</pre>`
        : `<p>Binary evidence; snapshot SHA-256 ${entry.hash} (${bytes.length} bytes).</p>`;

      return `<details><summary>${escapeHtml(label)}</summary>${content}</details>`;
    })
    .join("");
}

export function writeArchitectureReport(
  state: string,
  name: string,
  title: string,
  text: string,
  details: string,
  open: boolean,
  assessments: readonly ArchitectureAssessment[] = []
): ArchitectureReportResult {
  const directory = join(state, "architecture", "reports");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${name}.html`);
  writeFileSync(
    path,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Architecture ${escapeHtml(name)}</title><style>body{font:18px system-ui;max-width:78ch;margin:2rem auto;padding:1rem;color:#18202a;background:#fff}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;padding:1rem;border:1px solid}summary:focus-visible{outline:3px solid #1765a8}h1{font-size:2rem}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>Experimental architecture evidence. Assessment does not demonstrate learner understanding.</p><pre>${escapeHtml(text)}</pre><details><summary>Inspect captured evidence and provenance</summary><pre>${escapeHtml(details)}</pre></details>${assessments.map((assessment) => capturedEvidence(state, assessment)).join("")}</main></body></html>`
  );

  if (!open) {
    return { opened: false, path, warnings: [] };
  }

  const executable = process.platform === "darwin" ? "open" : "xdg-open";

  const launched = spawnSync(executable, [path], {
    encoding: "utf-8",
    timeout: 10_000,
  });

  const opened = !launched.error && launched.status === 0;

  return {
    opened,
    path,
    warnings: opened
      ? []
      : [`Open ${path} in your browser; automatic opening failed`],
  };
}
