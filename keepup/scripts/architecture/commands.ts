import {
  compareAssessments,
  comparisonReport,
  comparisonText,
} from "./comparison.ts";
import { parseAssessment } from "./parse.ts";
import { architectureReport, architectureText } from "./report.ts";
import {
  inspectAssessment,
  listAssessments,
  recordAssessment,
} from "./storage.ts";

export function architectureCommand(
  root: string,
  state: string,
  args: readonly string[]
): string {
  const [command, value] = args;

  if (command === "record") {
    return JSON.stringify(
      recordAssessment(root, state, parseAssessment(JSON.parse(value ?? "")))
    );
  }

  if (command === "list") {
    return JSON.stringify(listAssessments(state));
  }

  if (command === "inspect" && value) {
    const result = inspectAssessment(root, state, value);

    return args.includes("--json")
      ? JSON.stringify(result)
      : architectureText(result);
  }

  if (command === "report" && value) {
    return JSON.stringify(
      architectureReport(
        state,
        inspectAssessment(root, state, value),
        !args.includes("--no-open")
      )
    );
  }

  if (
    (command === "compare" || command === "compare-report") &&
    value &&
    args[2]
  ) {
    const comparison = compareAssessments(root, state, value, args[2]);

    if (command === "compare-report") {
      return JSON.stringify(
        comparisonReport(state, comparison, !args.includes("--no-open"))
      );
    }

    return args.includes("--json")
      ? JSON.stringify(comparison)
      : comparisonText(comparison);
  }

  throw new Error(
    "Usage: keepup architecture record <json> | list | inspect <id> [--json] | report <id> [--no-open] | compare <before> <after> [--json] | compare-report <before> <after> [--no-open]"
  );
}
