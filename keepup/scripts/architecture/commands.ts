import { parseAssessment } from "./parse.ts";
import { architectureReport, architectureText } from "./report.ts";
import { analyseSeams } from "./seams.ts";
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

  if (command === "analyse") {
    const input = parseAssessment(JSON.parse(value ?? ""));

    if (input.dimension !== "seam-integrity") {
      throw new Error("analyse requires seam-integrity definition");
    }

    return JSON.stringify(
      recordAssessment(root, state, input, (definition) =>
        analyseSeams(root, definition, process.env.KEEPUP_ANALYSER_DIRECTORY)
      )
    );
  }

  if (command === "record") {
    const input = parseAssessment(JSON.parse(value ?? ""));

    if (input.dimension === "seam-integrity") {
      throw new Error(
        "Use architecture analyse; automated observations are CLI-owned"
      );
    }

    return JSON.stringify(recordAssessment(root, state, input));
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
    "Usage: keepup architecture record <json> | analyse <json> | list | inspect <id> [--json] | report <id> [--no-open]"
  );
}
