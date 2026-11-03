/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- Quiz CLI and stored JSON are reconstructed at this boundary. */
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { parseEvent } from "./handlers/parse-event.ts";
import type { StoredEvent } from "./keepup.ts";
import { grade, pose } from "./question.ts";
import type { Posed, QuestionSpec, Verdict } from "./question.ts";

interface PoseInput extends QuestionSpec {
  id: string;
  stem: string;
  file: string;
  concept: string;
}

interface AnswerInput {
  id: string;
  answer: string;
  values: string[];
  dontKnow?: boolean;
}

interface StoredQuestion {
  spec: PoseInput;
  posed: Posed;
  answer?: { input: AnswerInput; verdict: Verdict };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected quiz object");
  }

  // SAFETY: A non-null, non-array object was established; its fields remain unknown.
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Expected nonempty quiz text");
  }

  return value;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Expected quiz string array");
  }

  return value.map(text);
}

function questionId(value: unknown): string {
  const id = text(value);

  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(id)) {
    throw new Error(
      "Question id must be 1-128 letters, numbers, dots, underscores or hyphens"
    );
  }

  return id;
}

function parsePoseInput(value: unknown): PoseInput {
  const source = object(value);

  if (
    Object.keys(source).some(
      (key) =>
        ![
          "concept",
          "correct",
          "file",
          "id",
          "multiSelect",
          "options",
          "stem",
        ].includes(key)
    )
  ) {
    throw new Error("Unsupported question spec field");
  }

  if (!Array.isArray(source.options)) {
    throw new TypeError("Question options must be an array");
  }

  if (
    source.multiSelect !== undefined &&
    typeof source.multiSelect !== "boolean"
  ) {
    throw new Error("multiSelect must be a boolean");
  }

  return {
    concept: text(source.concept),
    correct:
      typeof source.correct === "string"
        ? text(source.correct)
        : strings(source.correct),
    file: text(source.file),
    id: questionId(source.id),
    multiSelect: source.multiSelect,
    options: source.options.map((item) => {
      const option = object(item);

      if (
        Object.keys(option).some((key) => key !== "label" && key !== "value")
      ) {
        throw new Error("Unsupported question option field");
      }

      if (option.value !== undefined && typeof option.value !== "string") {
        throw new TypeError("Question option value must be a string");
      }

      return {
        label: text(option.label),
        value: option.value,
      };
    }),
    stem: text(source.stem),
  };
}

function parseAnswerInput(value: unknown): AnswerInput {
  const source = object(value);

  if (
    Object.keys(source).some(
      (key) => !["id", "answer", "values", "dontKnow"].includes(key)
    )
  ) {
    throw new Error("Quiz answers only accept id, answer, values and dontKnow");
  }

  if (source.dontKnow !== undefined && typeof source.dontKnow !== "boolean") {
    throw new Error("dontKnow must be a boolean");
  }

  const values =
    source.dontKnow && source.values === undefined
      ? []
      : strings(source.values);

  if (source.dontKnow) {
    if (values.length) {
      throw new Error("Choose either one selected value or dontKnow");
    }

    return {
      answer: text(source.answer),
      dontKnow: true,
      id: questionId(source.id),
      values,
    };
  }

  if (values.length !== 1) {
    throw new Error("Quiz answers require one selected value");
  }

  return { answer: text(source.answer), id: questionId(source.id), values };
}

function questionPath(state: string, id: string) {
  return join(state, "questions", `${questionId(id)}.json`);
}

function writeQuestion(state: string, question: StoredQuestion) {
  writeRecord(questionPath(state, question.spec.id), question);
}

function writeRecord(path: string, record: StoredQuestion | QuizReservation[]) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;

  try {
    writeFileSync(temporary, `${JSON.stringify(record)}\n`, { flag: "wx" });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function readQuestion(state: string, id: string): StoredQuestion {
  const path = questionPath(state, id);

  if (!existsSync(path)) {
    throw new Error(`Unknown posed question: ${id}`);
  }

  const source = object(JSON.parse(readFileSync(path, "utf-8")));
  const spec = parsePoseInput(source.spec);
  const rawPosed = object(source.posed);

  if (
    spec.id !== id ||
    !Array.isArray(rawPosed.options) ||
    !Array.isArray(rawPosed.correctIndices)
  ) {
    throw new Error("Invalid stored posed question");
  }

  const options = rawPosed.options.map((value) => {
    const option = object(value);

    return { label: text(option.label), value: text(option.value) };
  });

  const correctIndices = rawPosed.correctIndices.map((index) => {
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 1 ||
      index > options.length
    ) {
      throw new Error("Invalid stored answer key position");
    }

    return index;
  });

  const question: StoredQuestion = { posed: { correctIndices, options }, spec };

  if (source.answer !== undefined) {
    const answer = object(source.answer);
    const input = parseAnswerInput(answer.input);
    const verdict = grade(question.posed, input);

    if (
      input.id !== id ||
      JSON.stringify(answer.verdict) !== JSON.stringify(verdict)
    ) {
      throw new Error("Invalid stored question verdict");
    }

    question.answer = { input, verdict };
  }

  return question;
}

export function poseQuestion(state: string, value: unknown) {
  const spec = parsePoseInput(value);

  if (
    new Set(
      spec.options.map((option) => option.label.trim().split(/\s+/u).length)
    ).size > 1
  ) {
    throw new Error("Question options must have equal word counts");
  }

  if (spec.multiSelect) {
    throw new Error("KeepUp does not support multi-select questions");
  }

  if (existsSync(questionPath(state, spec.id))) {
    const stored = readQuestion(state, spec.id);

    if (JSON.stringify(stored.spec) !== JSON.stringify(spec)) {
      throw new Error("Question id already posed with different input");
    }

    return { id: spec.id, options: stored.posed.options };
  }

  const result = pose(spec, Math.random);

  if (!result.ok) {
    throw new Error(result.problems.join("; "));
  }

  writeQuestion(state, { posed: result.posed, spec });

  return { id: spec.id, options: result.posed.options };
}

export function answerQuestion(state: string, value: unknown) {
  const input = parseAnswerInput(value);
  const question = readQuestion(state, input.id);

  if (question.answer) {
    if (JSON.stringify(question.answer.input) !== JSON.stringify(input)) {
      throw new Error("Question already answered with different input");
    }

    return question.answer.verdict;
  }

  const verdict = grade(question.posed, input);
  question.answer = { input, verdict };
  writeQuestion(state, question);

  return verdict;
}

function expandedQuizEvent(state: string, value: unknown) {
  const source = object(value);

  if (source.type !== "quiz" || !Array.isArray(source.answers)) {
    return parseEvent(value);
  }

  const answers = source.answers.map((item) => {
    const answer = object(item);

    if (!("posed" in answer)) {
      return answer;
    }

    if (Object.keys(answer).length !== 1) {
      throw new Error("Posed references only accept the posed id");
    }

    const question = readQuestion(state, questionId(answer.posed));

    if (!question.answer) {
      throw new Error("Posed question has not been answered");
    }

    return {
      answer: question.answer.input.answer,
      concept: question.spec.concept,
      correct: question.answer.verdict.correct,
      file: question.spec.file,
      question: [
        question.spec.stem,
        ...question.posed.options.map(
          (option, index) =>
            `${String.fromCodePoint(65 + index)}. ${option.label}`
        ),
      ].join("\n"),
    };
  });

  return parseEvent({ ...source, answers });
}

interface QuizReservation {
  id: string;
  who: string;
  retryDigest: string;
  references: (string | null)[];
}

function readReservations(state: string): QuizReservation[] {
  const path = join(state, "quiz-log.json");

  if (!existsSync(path)) {
    return [];
  }

  const records: unknown = JSON.parse(readFileSync(path, "utf-8"));

  if (!Array.isArray(records)) {
    throw new TypeError("Invalid quiz log reservations");
  }

  return records.map((value) => {
    const record = object(value);

    if (!Array.isArray(record.references)) {
      throw new TypeError("Invalid quiz log references");
    }

    return {
      id: text(record.id),
      references: record.references.map((id) =>
        id === null ? null : questionId(id)
      ),
      retryDigest: text(record.retryDigest),
      who: text(record.who),
    };
  });
}

export function resolveQuizEvent(
  state: string,
  value: unknown,
  events: StoredEvent[],
  who: string
) {
  const input = expandedQuizEvent(state, value);
  const source = object(value);

  const references =
    input.type === "quiz" && Array.isArray(source.answers)
      ? source.answers.map((item) => {
          const entry = object(item);

          return "posed" in entry ? questionId(entry.posed) : null;
        })
      : [];

  const ids = references.filter((id) => id !== null);

  if (new Set(ids).size !== ids.length) {
    throw new Error("A posed question can only appear once in an event");
  }

  // Reservations without a committed event are failed writes, not earned credit.
  const committed = readReservations(state).filter((record) =>
    events.some(
      (event) =>
        event.id === record.id &&
        event.who === record.who &&
        event.retryDigest === record.retryDigest
    )
  );

  const previous = events.find(
    (event) => event.id === input.id && event.who === who
  );

  const reservation = committed.find(
    (record) => record.id === input.id && record.who === who
  );

  const normalized = ids.length ? references : [];

  if (
    previous &&
    JSON.stringify(reservation?.references ?? []) !== JSON.stringify(normalized)
  ) {
    throw new Error("Retry id already used with different posed references");
  }

  if (
    committed.some(
      (record) =>
        (record.id !== input.id || record.who !== who) &&
        record.references.some((id) => id !== null && ids.includes(id))
    )
  ) {
    throw new Error("Posed question already logged in another event");
  }

  return {
    input,
    reserve: (event: StoredEvent) => {
      if (ids.length) {
        writeRecord(join(state, "quiz-log.json"), [
          ...committed,
          {
            id: event.id,
            references,
            retryDigest: event.retryDigest,
            who: event.who,
          },
        ]);
      }
    },
  };
}

export function quizCommand(state: string, args: string[]) {
  const [command, json] = args;

  if (command === "pose") {
    return poseQuestion(state, JSON.parse(json ?? ""));
  }

  if (command === "answer") {
    return answerQuestion(state, JSON.parse(json ?? ""));
  }

  throw new Error("Usage: up quiz pose <json> | quiz answer <json>");
}
