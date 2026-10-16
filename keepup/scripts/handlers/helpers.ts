// @ts-check
import {
  kataResults,
  quizPhases,
  responses,
  eventFields,
  shownDepths,
} from "./types.ts";
import type {
  EventFile,
  EventFiles,
  EventId,
  EventResponse,
  EventText,
  EventType,
  EventWithDepth,
  EventWithKataNumber,
  EventWithKataStart,
  EventWithKataSubmit,
  EventWithQuiz,
  EventWithResponse,
  EventWithText,
  KataChecks,
  KataLabel,
  KataNumber,
  KataResult,
  KataTarget,
  KnownEvent,
  QuizAnswer,
  QuizAnswers,
  QuizPhase,
  ShownDepth,
} from "./types.ts";

export const parseEventType = (value: unknown): EventType => {
  if (typeof value === "string" && Object.hasOwn(eventFields, value)) {
    // SAFETY: The string is an own key of the event field registry.
    return value as EventType;
  }

  throw new Error("Invalid event type");
};

export const parseEventId = (value: unknown): EventId => {
  if (typeof value === "string" && value.trim().length > 0) {
    // SAFETY: The identifier is a string with non-whitespace content.
    return value as EventId;
  }

  throw new Error("Invalid event id, type or files");
};

const parseEventFile = (value: unknown): EventFile => {
  if (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.includes("\n")
  ) {
    // SAFETY: The path is a nonempty string without a newline.
    return value as EventFile;
  }

  throw new Error("Invalid event id, type or files");
};

export const parseEventFiles = (value: unknown): EventFiles => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Invalid event id, type or files");
  }

  const files = value.map(parseEventFile);

  if (new Set(files).size !== files.length) {
    throw new Error("Invalid event id, type or files");
  }

  // SAFETY: parsed files are nonempty and unique; the tuple's phantom brand has no runtime property.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- TypeScript cannot directly brand a validated array as a nonempty tuple.
  return files as unknown as EventFiles;
};

export const parseEventFields = <T extends EventType>(
  value: object,
  type: T,
  id: EventId,
  files: EventFiles
): KnownEvent<T> => {
  const fieldNames: readonly string[] = eventFields[type];
  const allowed = new Set(["id", "type", "files", ...fieldNames]);

  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error("Unknown or protected event field");
  }

  // SAFETY: Only the fields for this event type remain; id and files were parsed.
  return { ...value, files, id, type } as KnownEvent<T>;
};

export const parseKataNumber = (value: unknown): KataNumber | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    // SAFETY: The value is an integer greater than or equal to one.
    return value as KataNumber;
  }

  throw new Error("Invalid kataNumber");
};

export const parseRequiredKataNumber = <T extends EventType>(
  event: KnownEvent<T>,
  kataNumber: KataNumber | undefined
): EventWithKataNumber<T> => {
  if (
    (event.type === "hint" || event.type === "kata_submit") &&
    kataNumber === undefined
  ) {
    throw new Error("kataNumber is required");
  }

  // SAFETY: Required kata numbers were checked; the optional number is already parsed.
  return (
    kataNumber === undefined ? event : { ...event, kataNumber }
  ) as EventWithKataNumber<T>;
};

const parseShownDepth = (value: unknown): ShownDepth => {
  if (
    typeof value === "string" &&
    shownDepths.some((allowed) => allowed === value)
  ) {
    // SAFETY: The value matches a member of shownDepths.
    return value as ShownDepth;
  }

  throw new Error("Invalid shown depth");
};

export const parseEventDepth = <T extends EventType>(
  event: EventWithKataNumber<T>,
  depth: unknown
): EventWithDepth<T> => {
  if (event.type !== "shown") {
    // SAFETY: This is not a shown event, so no depth field is required.
    return event as EventWithDepth<T>;
  }

  // SAFETY: The shown event gains a depth accepted by parseShownDepth.
  return { ...event, depth: parseShownDepth(depth) } as EventWithDepth<T>;
};

const parseEventResponseValue = (value: unknown): EventResponse => {
  if (
    typeof value === "string" &&
    responses.some((allowed) => allowed === value)
  ) {
    // SAFETY: The value matches a member of responses.
    return value as EventResponse;
  }

  throw new Error("Invalid response");
};

export const parseEventResponse = <T extends EventType>(
  event: EventWithDepth<T>,
  response: unknown
): EventWithResponse<T> => {
  if (event.type !== "response") {
    // SAFETY: This is not a response event, so no response field is required.
    return event as EventWithResponse<T>;
  }

  // SAFETY: The response event gains a response accepted by its parser.
  return {
    ...event,
    response: parseEventResponseValue(response),
  } as EventWithResponse<T>;
};

const parseEventTextValue = (value: unknown): EventText => {
  if (typeof value === "string" && value.trim().length > 0) {
    // SAFETY: The text is a string with non-whitespace content.
    return value as EventText;
  }

  throw new Error("Nonempty text is required");
};

export const parseEventText = <T extends EventType>(
  event: EventWithResponse<T>,
  text: unknown
): EventWithText<T> => {
  if (event.type !== "hint" && event.type !== "explain") {
    // SAFETY: This event is neither hint nor explain, so no text field is required.
    return event as EventWithText<T>;
  }

  // SAFETY: The hint or explain event gains parsed nonempty text.
  return { ...event, text: parseEventTextValue(text) } as EventWithText<T>;
};

const quizAnswerKeys = new Set([
  "file",
  "concept",
  "question",
  "answer",
  "correct",
]);

const parseQuizText = (value: unknown): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error("Invalid quiz answer");
};

const parseQuizAnswer = (value: unknown, files: EventFiles): QuizAnswer => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid quiz answer");
  }

  // SAFETY: The value is a non-null object, and each field is parsed below.
  const record = value as Record<string, unknown>;

  if (Object.keys(record).some((key) => !quizAnswerKeys.has(key))) {
    throw new Error("Invalid quiz answer");
  }

  const file = files.find((item) => item === record.file);

  if (file === undefined) {
    throw new Error("Invalid quiz answer");
  }

  if (typeof record.correct !== "boolean") {
    throw new TypeError("Invalid quiz answer");
  }

  // SAFETY: All keys, file membership, boolean correctness, and text fields were checked.
  return {
    answer: parseQuizText(record.answer),
    concept: parseQuizText(record.concept),
    correct: record.correct,
    file,
    question: parseQuizText(record.question),
  } as QuizAnswer;
};

const parseQuizPhase = (value: unknown): QuizPhase => {
  if (
    typeof value === "string" &&
    quizPhases.some((allowed) => allowed === value)
  ) {
    // SAFETY: The value matches a member of quizPhases.
    return value as QuizPhase;
  }

  throw new Error("Invalid quiz phase or answers");
};

const parseQuizAnswers = (value: unknown, files: EventFiles): QuizAnswers => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Invalid quiz phase or answers");
  }

  const [first, ...rest] = value.map((item) => parseQuizAnswer(item, files));

  if (first === undefined) {
    throw new Error("Invalid quiz phase or answers");
  }

  return [first, ...rest];
};

export const parseEventQuiz = <T extends EventType>(
  event: EventWithText<T>,
  phase: unknown,
  answers: unknown
): EventWithQuiz<T> => {
  if (event.type !== "quiz") {
    // SAFETY: This is not a quiz, so phase and answers are not required.
    return event as EventWithQuiz<T>;
  }

  const parsedPhase = parseQuizPhase(phase);
  const parsedAnswers = parseQuizAnswers(answers, event.files);

  if (
    parsedPhase === "check" &&
    (event.files.length !== 1 || parsedAnswers.length !== 1)
  ) {
    throw new Error("A check requires exactly one answer about one file");
  }

  if (
    event.files.some(
      (file) => !parsedAnswers.some((answer) => answer.file === file)
    )
  ) {
    throw new Error("Every quiz file needs an answer");
  }

  // SAFETY: Phase and answers were parsed, file coverage checked, and check cardinality enforced.
  return {
    ...event,
    answers: parsedAnswers,
    phase: parsedPhase,
  } as EventWithQuiz<T>;
};

const kataTargetKeys = new Set(["file", "metric", "goal"]);

const parseKataLabel = (value: unknown): KataLabel => {
  if (typeof value === "string" && value.trim().length > 0) {
    // SAFETY: The label is a string with non-whitespace content.
    return value as KataLabel;
  }

  throw new Error("Invalid kata context");
};

const parseKataTarget = (value: unknown, files: EventFiles): KataTarget => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid kata context");
  }

  // SAFETY: The value is a non-null object, and each field is parsed below.
  const record = value as Record<string, unknown>;

  if (Object.keys(record).some((key) => !kataTargetKeys.has(key))) {
    throw new Error("Invalid kata context");
  }

  const file = files.find((item) => item === record.file);
  const { metric } = record;
  const { goal } = record;

  if (
    file === undefined ||
    typeof metric !== "string" ||
    metric.trim().length === 0 ||
    typeof goal !== "number" ||
    !Number.isFinite(goal) ||
    goal < 0 ||
    goal > 1
  ) {
    throw new Error("Invalid kata context");
  }

  // SAFETY: The file belongs to the event, metric is nonempty, and goal is finite in 0..1.
  return { file, goal, metric } as KataTarget;
};

export const parseEventKataStart = <T extends EventType>(
  event: EventWithQuiz<T>,
  technique: unknown,
  module: unknown,
  target: unknown
): EventWithKataStart<T> => {
  if (event.type !== "kata_start") {
    // SAFETY: This is not a kata start, so no start context is required.
    return event as EventWithKataStart<T>;
  }

  // SAFETY: The kata start gains parsed labels and a validated target.
  return {
    ...event,
    module: parseKataLabel(module),
    target: parseKataTarget(target, event.files),
    technique: parseKataLabel(technique),
  } as EventWithKataStart<T>;
};

const parseKataResult = (value: unknown): KataResult => {
  if (
    typeof value === "string" &&
    kataResults.some((allowed) => allowed === value)
  ) {
    // SAFETY: The value matches a member of kataResults.
    return value as KataResult;
  }

  throw new Error("Invalid kata result or checks");
};

const parseKataChecks = (value: unknown): KataChecks | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    // SAFETY: Checks intentionally accepts any non-null, non-array object.
    return value as KataChecks;
  }

  throw new Error("Invalid kata result or checks");
};

export const parseEventKataSubmit = <T extends EventType>(
  event: EventWithKataStart<T>,
  result: unknown,
  checks: unknown
): EventWithKataSubmit<T> => {
  if (event.type !== "kata_submit") {
    // SAFETY: This is not a kata submission, so no submission result is required.
    return event as EventWithKataSubmit<T>;
  }

  const parsedResult = parseKataResult(result);
  const parsedChecks = parseKataChecks(checks);

  // SAFETY: The submission gains a parsed result and optional validated checks object.
  return (
    parsedChecks === undefined
      ? { ...event, result: parsedResult }
      : { ...event, checks: parsedChecks, result: parsedResult }
  ) as EventWithKataSubmit<T>;
};
