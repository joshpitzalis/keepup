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

  throw new Error(
    "Usage: keepup architecture record <json> | list | inspect <id> [--json] | report <id> [--no-open]"
  );
}
