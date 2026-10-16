import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ArchitectureInspection } from "./domain.ts";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function architectureText(result: ArchitectureInspection): string {
  const { assessment, freshness } = result;
  const { measurements, input } = assessment;

  if (input.dimension === "seam-integrity" && "violations" in measurements) {
    return [
      `Architecture ${assessment.id}: seam-integrity (automated)`,
      `Modules: ${input.modules.map((module) => module.id).join(", ")}; freshness: ${freshness.status}`,
      `Violations: ${measurements.violations}; eligible edges: ${measurements.eligibleEdges}; coverage: ${assessment.analysis?.status ?? "unavailable"}`,
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
    ...("independentPolicySites" in measurements
      ? [
          `Independent policy sites: ${measurements.independentPolicySites}; calls: ${measurements.calls}; confirmed rules: ${measurements.denominator}`,
          `Proposed rules: ${measurements.proposedRules}; unclear rules: ${measurements.unclearRules}`,
          "Affected owners and trust boundaries remain separate from locality score; see reviewed inventory below",
        ]
      : [
          `Caller obligations: domain ${measurements.domainObligations}; avoidable ${measurements.avoidableObligations}`,
        ]),
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
    open
  );
}

export function writeArchitectureReport(
  state: string,
  name: string,
  title: string,
  text: string,
  details: string,
  open: boolean
): ArchitectureReportResult {
  const directory = join(state, "architecture", "reports");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${name}.html`);
  writeFileSync(
    path,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Architecture ${escapeHtml(name)}</title><style>body{font:18px system-ui;max-width:78ch;margin:2rem auto;padding:1rem;color:#18202a;background:#fff}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;padding:1rem;border:1px solid}summary:focus-visible{outline:3px solid #1765a8}h1{font-size:2rem}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>Experimental architecture evidence. Assessment does not demonstrate learner understanding.</p><pre>${escapeHtml(text)}</pre><details><summary>Inspect captured evidence and provenance</summary><pre>${escapeHtml(details)}</pre></details></main></body></html>`
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
