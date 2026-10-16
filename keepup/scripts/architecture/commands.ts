import { parseAssessment } from "./parse.ts";
import { architectureReport, architectureText } from "./report.ts";
import {
  inspectAssessment,
  listAssessments,
  recordAssessment,
} from "./storage.ts";
import { executeTestability } from "./testability-run.ts";

export function architectureCommand(
  root: string,
  state: string,
  args: readonly string[]
): string {
  const [command, value] = args;

  if (command === "testability") {
    const input = parseAssessment(JSON.parse(value ?? ""));

    if (input.dimension !== "behavioural-testability") {
      throw new Error("Expected behavioural-testability input");
    }

    return JSON.stringify(
      recordAssessment(root, state, input, (candidate) =>
        executeTestability(root, candidate)
      )
    );
  }

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
