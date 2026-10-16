// @ts-check

import {
  parseEventDepth,
  parseEventFields,
  parseEventFiles,
  parseEventId,
  parseEventKataStart,
  parseEventKataSubmit,
  parseEventQuiz,
  parseEventResponse,
  parseEventText,
  parseEventType,
  parseKataNumber,
  parseRequiredKataNumber,
} from "./helpers.ts";
import type {
  EventType,
  EventWithDepth,
  EventWithKataNumber,
  EventWithKataStart,
  EventWithQuiz,
  EventWithResponse,
  EventWithText,
  KnownEvent,
} from "./types.ts";
import { pipe } from "./utils.ts";

export function parseEvent(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid event id, type or files");
  }

  // SAFETY: value is a non-null, non-array object; the pipeline parses each field.
  const input = value as Record<string, unknown>;

  const type = parseEventType(input.type);
  const id = parseEventId(input.id);
  const files = parseEventFiles(input.files);

  return pipe(
    parseEventFields(input, type, id, files),
    (event: KnownEvent<EventType>) =>
      parseRequiredKataNumber(event, parseKataNumber(input.kataNumber)),
    (event: EventWithKataNumber<EventType>) =>
      parseEventDepth(event, input.depth),
    (event: EventWithDepth<EventType>) =>
      parseEventResponse(event, input.response),
    (event: EventWithResponse<EventType>) => parseEventText(event, input.text),
    (event: EventWithText<EventType>) =>
      parseEventQuiz(event, input.phase, input.answers),
    (event: EventWithQuiz<EventType>) =>
      parseEventKataStart(event, input.technique, input.module, input.target),
    (event: EventWithKataStart<EventType>) =>
      parseEventKataSubmit(event, input.result, input.checks)
  );
}
