export interface QuestionSpec {
  options: { label: string; value?: string }[];
  correct: string | string[];
  multiSelect?: boolean;
}

export interface Posed {
  options: { label: string; value: string }[];
  correctIndices: number[];
}

export interface Response {
  values: string[];
  dontKnow?: boolean;
  confidence?: number;
}

export interface Verdict {
  correct: boolean;
  selected: { label: string; value: string; index: number }[];
  unknownValues: string[];
  dontKnow: boolean;
  confidence?: number;
}

export function parseOptions(options: QuestionSpec["options"]) {
  const resolved = options.map((option) => ({
    label: option.label.trim(),
    value: option.value?.trim() || option.label.trim(),
  }));

  const problems: string[] = [];

  if (resolved.length < 2 || resolved.some((option) => !option.label)) {
    problems.push("A question needs at least two nonempty options");
  }

  if (
    new Set(resolved.map((option) => option.value)).size !== resolved.length
  ) {
    problems.push("Duplicate option values");
  }

  return { options: resolved, problems };
}

export function pose(
  spec: QuestionSpec,
  rand: () => number
): { ok: true; posed: Posed } | { ok: false; problems: string[] } {
  const { options, problems } = parseOptions(spec.options);

  const correct = [
    ...new Set(
      (Array.isArray(spec.correct) ? spec.correct : [spec.correct]).map(
        (value) => value.trim()
      )
    ),
  ];

  if (
    !correct.length ||
    correct.some((value) => !options.some((option) => option.value === value))
  ) {
    problems.push("Answer key must match an option");
  }

  if (!spec.multiSelect && correct.length !== 1) {
    problems.push("Single-answer questions need exactly one correct option");
  }

  if (problems.length) {
    return { ok: false, problems };
  }

  // Keep LearnHarness's descending Fisher-Yates swaps and random draw order.
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = options[i];
    const b = options[j];

    if (!a || !b) {
      throw new Error("Random source must return a number in [0, 1)");
    }

    options[i] = b;
    options[j] = a;
  }

  return {
    ok: true,
    posed: {
      correctIndices: options.flatMap((option, index) =>
        correct.includes(option.value) ? [index + 1] : []
      ),
      options,
    },
  };
}

export function grade(posed: Posed, response: Response): Verdict {
  const values = new Set(response.values);

  const selected = posed.options.flatMap((option, index) =>
    values.has(option.value) ? [{ ...option, index: index + 1 }] : []
  );

  const unknownValues = [...values].filter(
    (value) => !posed.options.some((option) => option.value === value)
  );

  return {
    correct:
      !response.dontKnow &&
      unknownValues.length === 0 &&
      selected.length === posed.correctIndices.length &&
      selected.every((option) => posed.correctIndices.includes(option.index)),
    dontKnow: response.dontKnow ?? false,
    selected,
    unknownValues,
  };
}
