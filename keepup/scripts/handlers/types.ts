export const eventFields = {
  architecture_pass: [
    "exerciseId",
    "attemptId",
    "acceptanceId",
    "evidenceDigest",
  ],
  explain: ["text", "kataNumber"],
  hint: ["text", "kataNumber"],
  kata_start: ["technique", "module", "target"],
  kata_submit: ["kataNumber", "result", "checks"],
  quiz: ["phase", "answers", "kataNumber"],
  response: ["response"],
  shown: ["depth"],
} as const;

export type EventType = keyof typeof eventFields;

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

export type KataNumber = Brand<number, "KataNumber">;

export type EventText = Brand<string, "EventText">;

export type EventId = Brand<string, "EventId">;

export type EventFile = Brand<string, "EventFile">;

export type EventFiles = Brand<
  readonly [EventFile, ...EventFile[]],
  "EventFiles"
>;

export type KnownEvent<T extends EventType> = T extends unknown
  ? Brand<
      {
        readonly id: EventId;
        readonly type: T;
        readonly files: EventFiles;
        // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Intermediate parser fields remain untrusted until their own stage.
      } & Partial<Record<(typeof eventFields)[T][number], unknown>>,
      "KnownEvent"
    >
  : never;

export type EventWithKataNumber<T extends EventType> = T extends unknown
  ? KnownEvent<T> & {
      readonly kataNumber: T extends "hint" | "kata_submit"
        ? KataNumber
        : KataNumber | undefined;
    }
  : never;

export const shownDepths = [
  "walkthrough",
  "paragraph",
  "line",
  "none",
] as const;

export type ShownDepth = (typeof shownDepths)[number];

export type EventWithDepth<T extends EventType> = T extends "shown"
  ? EventWithKataNumber<T> & { readonly depth: ShownDepth }
  : EventWithKataNumber<T>;

export const responses = ["got-it", "skip", "kata", "next"] as const;

export type EventResponse = (typeof responses)[number];

export type EventWithResponse<T extends EventType> = T extends "response"
  ? EventWithDepth<T> & { readonly response: EventResponse }
  : EventWithDepth<T>;

export type EventWithText<T extends EventType> = T extends "hint" | "explain"
  ? EventWithResponse<T> & { readonly text: EventText }
  : EventWithResponse<T>;

export const quizPhases = ["pre", "post", "check"] as const;

export type QuizPhase = (typeof quizPhases)[number];

export type QuizAnswer = Brand<
  {
    readonly file: EventFile;
    readonly concept: string;
    readonly question: string;
    readonly answer: string;
    readonly correct: boolean;
  },
  "QuizAnswer"
>;

export type QuizAnswers = readonly [QuizAnswer, ...QuizAnswer[]];

export type EventWithQuiz<T extends EventType> = T extends "quiz"
  ? EventWithText<T> &
      (
        | { readonly phase: "pre" | "post"; readonly answers: QuizAnswers }
        | { readonly phase: "check"; readonly answers: readonly [QuizAnswer] }
      )
  : EventWithText<T>;

export type KataLabel = Brand<string, "KataLabel">;

export type KataTarget = Brand<
  {
    readonly file: EventFile;
    readonly metric: string;
    readonly goal: number;
  },
  "KataTarget"
>;

export type EventWithKataStart<T extends EventType> = T extends "kata_start"
  ? EventWithQuiz<T> & {
      readonly technique: KataLabel;
      readonly module: KataLabel;
      readonly target: KataTarget;
    }
  : EventWithQuiz<T>;

export const kataResults = ["pass", "fail", "abandon"] as const;

export type KataResult = (typeof kataResults)[number];

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Checks are an intentionally open JSON evidence payload, never executed.
export type KataChecks = Brand<Record<string, unknown>, "KataChecks">;

export type EventWithKataSubmit<T extends EventType> = T extends "kata_submit"
  ? EventWithKataStart<T> & {
      readonly result: KataResult;
      readonly checks?: KataChecks;
    }
  : EventWithKataStart<T>;

export type EventWithArchitecturePass<T extends EventType> =
  T extends "architecture_pass"
    ? EventWithKataSubmit<T> & {
        readonly acceptanceId: string;
        readonly exerciseId: string;
        readonly attemptId: string;
        readonly evidenceDigest: string;
      }
    : EventWithKataSubmit<T>;
