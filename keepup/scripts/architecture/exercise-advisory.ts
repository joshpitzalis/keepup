import { compareAssessments } from "./comparison.ts";
import type { ArchitectureAssessment } from "./domain.ts";
import type { ExerciseInventory } from "./exercise-domain.ts";
import { listAssessments, readAssessment } from "./storage.ts";

function sameSource(
  assessment: ArchitectureAssessment,
  inventory: ExerciseInventory
): boolean {
  return (
    assessment.observation.revision === inventory.revision &&
    JSON.stringify(assessment.observation.manifest) ===
      JSON.stringify(inventory.manifest)
  );
}

export function exerciseAdvisory(
  root: string,
  state: string,
  before: ExerciseInventory,
  after: ExerciseInventory
): readonly string[] {
  const observations = listAssessments(state)
    .map((id) => readAssessment(state, id))
    .toSorted((one, two) =>
      one.observation.time.localeCompare(two.observation.time)
    );

  return [
    "interface-leverage",
    "change-locality",
    "behavioural-testability",
    "navigability",
  ].map((dimension) => {
    const original = observations.findLast(
      (assessment) =>
        assessment.dimension === dimension && sameSource(assessment, before)
    );

    const current = observations.findLast(
      (assessment) =>
        assessment.dimension === dimension && sameSource(assessment, after)
    );

    if (!original || !current) {
      return `${dimension}: unassessed; no captured before/after pair for these exact source snapshots. No automatic semantic re-rating.`;
    }

    const result = compareAssessments(root, state, original.id, current.id);

    return result.comparable
      ? `${dimension} advisory ${original.id} -> ${current.id}: ${JSON.stringify({ after: current.measurements, before: original.measurements, changes: result.changes })}`
      : `${dimension}: unavailable comparison (${result.reasons.join("; ")}); no automatic semantic re-rating.`;
  });
}
