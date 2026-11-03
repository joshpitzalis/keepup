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
import { join } from "node:path";

import { parseEvent } from "./handlers/parse-event.ts";
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
  const values = strings(source.values);

  if (values.length !== 1) {
    throw new Error("Quiz answers require one selected value");
  }

  return { answer: text(source.answer), id: questionId(source.id), values };
}

function questionPath(state: string, id: string) {
  return join(state, "questions", `${questionId(id)}.json`);
}

function writeQuestion(state: string, question: StoredQuestion) {
  mkdirSync(join(state, "questions"), { recursive: true });
  const path = questionPath(state, question.spec.id);
  const temporary = `${path}.${randomUUID()}.tmp`;

  try {
    writeFileSync(temporary, `${JSON.stringify(question)}\n`, { flag: "wx" });
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
    throw new Error("Question already answered");
  }

  const verdict = grade(question.posed, input);
  question.answer = { input, verdict };
  writeQuestion(state, question);

  return verdict;
}

export function resolveQuizEvent(state: string, value: unknown) {
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
