/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- Common architecture JSON boundary returns reconstructed fields. */
import type { ArchitectureModule, ArchitectureReview } from "./domain.ts";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected architecture object");
  }

  // SAFETY: non-null, non-array object established; values remain unknown.
  return value as Record<string, unknown>;
}

export function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Expected nonempty architecture text");
  }

  return value;
}

export function strings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Expected architecture string array");
  }

  return value.map(text);
}

export function parseArchitectureId(value: unknown): string {
  const id = text(value);

  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(id)) {
    throw new Error(
      "Architecture id must be 1-128 letters, numbers, dots, underscores or hyphens"
    );
  }

  return id;
}

export function parseModule(value: unknown): ArchitectureModule {
  const source = object(value);
  const members = strings(source.members);
  const entryPoints = strings(source.interface);

  if (
    !members.length ||
    !entryPoints.length ||
    entryPoints.some((file) => !members.includes(file))
  ) {
    throw new Error(
      "Module requires members and intended interface files within members"
    );
  }

  return {
    id: parseArchitectureId(source.id),
    interface: [...new Set(entryPoints)].toSorted(),
    members: [...new Set(members)].toSorted(),
  };
}

export function parseReview(value: unknown): ArchitectureReview {
  const source = object(value);
  const { status, confidence } = source;

  if (status !== "reviewed" && status !== "provisional") {
    throw new Error("Review status must be reviewed or provisional");
  }

  if (
    confidence !== "low" &&
    confidence !== "medium" &&
    confidence !== "high"
  ) {
    throw new Error("Review confidence must be low, medium or high");
  }

  return {
    confidence,
    notes: text(source.notes),
    reviewer: text(source.reviewer),
    status,
  };
}
