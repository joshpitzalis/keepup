# First seam: checked questions

Note from 2 November 2026. Based on reading code only; no tests were run.

**Shared module is small: three functions, pure, no I/O.** Learner records, UI and storage stay in each project.

## Shared interface

```ts
type Draft = {
  options: { label: string; value?: string }[];
  correct: string | string[];
  multiSelect?: boolean;
};
type Posed = {
  options: { label: string; value: string }[]; // display order
  correctIndices: number[];                    // 1-based
};
type Response = { values: string[]; dontKnow?: boolean; confidence?: number };
type Verdict = {
  correct: boolean;
  selected: { label: string; value: string; index: number }[];
  unknownValues: string[];
  dontKnow: boolean;
  confidence?: number; // clamped 0-100, absent on dontKnow
};

parseOptions(options): { options; problems: string[] }
pose(draft, rand: () => number): { ok: true; posed: Posed } | { ok: false; problems: string[] }
grade(posed, response): Verdict
```

**Hidden behind it:** trimming, value fallback to label, duplicate detection, answer-key cleanup, shuffle, value-to-index resolution, set matching, confidence clamp.

**Key choice: caller injects `rand`.** LearnHarness must re-derive same order on every render, so it passes `seededRandom(toolCallId)`. KeepUp stores order once, so any random source works. `seededRandom` stays in LearnHarness, and `layout.ts` keeps using it untouched.

**One small extra export:** `stripModelValueDebris`, because `chains.ts` also uses it.

## LearnHarness seam

Seam runs through middle of `question-core.ts`:

| Moves to module | Stays in LearnHarness |
|---|---|
| `normalizeOptions`, `optionProblems` | TypeBox schemas and `quizInputProblems` wrapper |
| `coerceCorrectAnswer`, `resolveCorrect` | Dock state (`toggleOption`, drafts) |
| `shuffleOptions`, `isCorrect` | `seededRandom` |
| `value-debris.ts` | `QuestionAnswerData`, `buildAnswer`, `compactAnswerForModel` |

Call sites change in `question-dock.tsx`, `tools.ts`, `tool-parts.ts`, `teacher-agent.ts` and `answer-presentation.ts`. Keeping `question-core.ts` as wrapper means most other imports don't change.

**Must not change:**

- **Shuffle output:** order is re-derived from `toolCallId`, so an algorithm change reorders any unanswered saved question.
- **Stored answers:** `buildAnswer` keeps writing same record, so saved chats are safe. This is lower risk than the module map page suggested.
- **Error text:** models read these messages and retry from them. `resolveCorrect` and `quizInputProblems` word theirs differently today, so check tests before merging them.

`tests/question-core.test.ts`, `question-tools.test.ts` and `tool-parts.test.ts` are safety net.

## KeepUp seam

KeepUp has no step before the answer. Today, agent shows question, then logs result. So it needs new step:

```text
keepup quiz pose <json>     validate, shuffle, store; returns options without key
agent shows options, learner answers
keepup quiz answer <json>   grade, store confidence, append normal quiz event
```

- **File, concept, phase:** stay KeepUp's. Module never sees them.
- **`quiz` event shape:** unchanged, with `correct` now computed. `answerAccuracy`, `checkState` and `exercise-submit.ts` all keep working.
- **New data:** goes in `.keepup/questions/<id>.json`, not `events.jsonl`. `parseQuizAnswer` rejects unknown keys, and old `keepup` installs share this log, so new fields could break them.
- **Prose rules:** "vary correct position" disappears from `kata.md` and `architecture-exercise.md`, since shuffle handles it.
- **Equal word counts:** stays KeepUp-local check, called before `pose`. It wouldn't suit LearnHarness maths options.

**Real evidence from the log:** only two quiz events exist. Options are embedded in question text in two different formats, and answers are `dont know` and `1 B`. Structured posing fixes that.

**Free-text answers:** stay agent-graded in both projects. LearnHarness `explain` and KeepUp's free-recall stay outside module.

**Known limit:** `grade` is only as right as key agent wrote. Stops the key changing after the answer, not a wrong key. KeepUp needs a way to dispute a bad key.

## Corrections to the module map page

- **LearnHarness gains less than page says.** Parity check stays in KeepUp, so LearnHarness mainly gets tidier code: its comments describe validation and grading rules kept in sync by hand. KeepUp gets nearly all new behaviour.
- **Weaker pitch to Amos.** They'd be accepting a refactor and a licence change for little product gain.
- **Sharing itself is questionable.** Moved logic is probably 150–200 lines. KeepUp could own this alone at little cost.
- **Page is out of date.** It still shows older four-function sketch and overstates LearnHarness gain.

## Recommendation

Build `pose` and `grade` in KeepUp behind this interface first, and validate it there. Offer to LearnHarness once real use shows it works. A seam with one caller is still hypothetical, and this path doesn't depend on Amos's answer.

**Licensing catch:** having read LearnHarness's implementation closely, KeepUp's version may not count as independent. Before writing code, either ask Amos for permission or make KeepUp AGPL. Preferred: ask Amos, since a yes also keeps sharing open later. This is not legal advice.

## Decisions, 3 November 2026

Settled in a grilling session. Terms are in [GLOSSARY.md](../GLOSSARY.md). Licence reasoning is in [ADR 0001](../docs/adr/0001-keepup-agpl.md).

**Path and licence**

- Build `pose` and `grade` in KeepUp behind the shared interface first. Offer them to LearnHarness once real use proves them.
- KeepUp is licensed AGPL-3.0 now, so coding doesn't wait on Amos. KeepUp had no licence file before.

**Interface**

- `Draft` is renamed `QuestionSpec`, because LearnHarness already uses "drafts" for the learner's unfinished selection.
- `confidence` stays in the interface. KeepUp v1 neither asks for it nor stores it.
- KeepUp v1 is single-answer only: `pose` rejects `multiSelect: true`.
- `stripModelValueDebris` is left out until LearnHarness adopts the module.
- `pose` copies LearnHarness's `shuffleOptions` algorithm exactly, and a test pins its output for a fixed `rand` sequence.
- Error wording is KeepUp's own for now. Matching it to LearnHarness happens at adoption time.

**KeepUp flow**

- The agent supplies the question id. An identical repeat `pose` returns the stored question unchanged, without reshuffling.
- The question spec carries `stem`, `file` and `concept` as KeepUp-only fields.
- `quiz pose` runs the equal-word-count check and rejects any failure with a message the agent can retry from.
- `quiz answer` takes the learner's exact words plus the selection the agent mapped them to (`values` or `dontKnow`). It grades the response and stores the verdict in `.keepup/questions/<id>.json`, writing nothing to the event log.
- Retrying `quiz answer` with an identical payload returns the stored verdict. A different payload for the same id is rejected.
- In `log`, each `answers` item is either a full agent-graded object or `{ "posed": "<id>" }`. The two kinds can mix in one event, and old payloads still work.
- For a posed reference, the CLI fills in the answer object:
  - `question` is the stem, then `A. …` `B. …` in display order.
  - `answer` is the learner's exact words.
  - `correct` comes from the verdict.
- A posed id can be logged only once across all events. A question restarted after a code change gets a new id. The abandoned file stays on disk and is never logged.
- The event shape is unchanged. One quiz still produces one event.

**Enforcement and limits**

- Prose is the only enforcement that multiple-choice questions go through `pose`, since the CLI can't tell them apart from free recall.
- Delayed checks stay free recall and agent-graded.
- The answer key sits readable in `.keepup/questions/`. Accepted, since the agent already holds the key.
- Disputing a bad key is out of the first slice and recorded as a known limit.

**Prose updates**

Replace "vary correct position" with "pose through the CLI" in four places: `quiz.md:11`, `kata.md:81`, `architecture-exercise.md:165` and `submit.md:34`. The original note above missed the last two.

**Code layout**

- `keepup/scripts/question.ts` holds the pure functions, with no KeepUp imports.
- `keepup/scripts/quiz.ts` holds storage, the word-count check and the CLI handlers.
- `scripts/SPEC.md` gets one line about them.

**Tests**

- `keepup/__tests__/question.test.ts`: the pure functions, plus the shuffle pin.
- `keepup/__tests__/quiz-cli.test.ts`: `pose`, `answer` and `log` with posed references. Covers retry, reuse rejection and word-count rejection.

**Out of scope:** updating `learnharness-module-map.html`.
