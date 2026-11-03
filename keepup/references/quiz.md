# First or standalone comprehension quiz

1. Run `status --json`; read the mission and available initial-assessment report.
   Choose a small representative sample across up to three important modules,
   preferring unassessed files and consequential public workflows. Inspect the
   source privately, including relevant callers. Keep target files closed for the
   learner until they answer. A quiz needs no test command or refactoring target.
2. Ask three code-checkable predict, trace or impact questions, one at a time.
   Use actual implementation behaviour and a specific concept/file for each.
   For every multiple-choice question, use the pose/answer/log flow below. Keep
   options parallel with equal word counts, which `quiz pose` enforces. Show its
   returned order with lettered options and keep the answer key private.
3. Wait for actual answers and clarify ambiguity. Grade multiple choice through
   `quiz answer`, then explain its verdict. Preserve the learner's exact words.
   If relevant code changes, recheck it and pose each affected question with a new
   id; leave the abandoned question unlogged. A skipped question grants no evidence.
4. Log the actual answered questions through the supported CLI, with a fresh retry
   ID, `type: "quiz"`, `phase: "pre"`, the exact answered `files`, and
   `{ "posed": "question-id" }` references for multiple choice. Omit
   `kataNumber`: this is a standalone quiz. On an uncertain write, retry the same
   ID and identical payload. Read the accepted event; rejection grants no credit.
5. Run `health` to refresh comprehension debt and save the updated summary. Explain
   how many sampled answers were correct and which source they covered; this is
   sampled evidence, not a whole-codebase knowledge certification. First-quiz credit
   remains subject to the existing quiz cap; delayed verification is separate.
   Offer `kata` for practice or `on` while agents work. The learner owns any edits.

If no safe code question can be established, explain why and record no quiz. An
interrupted quiz may record only questions actually answered and graded, never
invent missing responses or grant practice credit.

## Pose, answer and log multiple choice

Use `node <CLI>` with the installed skill's `scripts/keepup.mjs`. These are payload
shapes: replace the question, key, file, concept, ids and learner words with actual
source-checked content. Pass each JSON payload as one argument.

Before showing a question, call `node <CLI> quiz pose '<json>'`:

```json
{"id":"constant-question-1","stem":"What does answer contain?","file":"answer.js","concept":"constant","options":[{"label":"Forty two","value":"forty-two"},{"label":"Twenty one","value":"twenty-one"}],"correct":"forty-two"}
```

The CLI validates single-answer options and equal whitespace-separated word counts,
shuffles them once, and returns the id and options without the key. Show the stem
and returned labels as A, B, … in that exact order. Keep the returned values to map
the learner's selection; do not ask the learner to use CLI syntax.

After their reply, clarify any ambiguity, then call `node <CLI> quiz answer '<json>'`
with their exact words and the selected option's returned value:

```json
{"id":"constant-question-1","answer":"Learner's exact response","values":["forty-two"]}
```

For an actual admission of uncertainty, use `{"id":"constant-question-1","answer":"dont know","dontKnow":true}`
with the learner's exact words instead. This is an incorrect answer, not a skip.
Use the returned verdict to explain the grade. Never supply `correct` yourself in a multiple-choice answer or log payload. Pose and answer do not append learning evidence; log the answered
reference through `node <CLI> log '<json>'`:

```json
{"id":"unique-quiz-attempt","type":"quiz","phase":"pre","files":["answer.js"],"answers":[{"posed":"constant-question-1"}]}
```

For uncertain writes, retry pose, answer or log with the same id and identical
payload. A pose retry keeps its order; an answer cannot change after grading. Each
posed question can appear in only one event. Never log an unanswered or abandoned
question. Restarting after source changes requires a fresh pose id and fresh answer.

Free recall and delayed checks are unchanged: grade them against the source and log
full `file`, `concept`, `question`, `answer`, `correct` objects. Full free-recall
objects and posed references may share one quiz event. Use only answered files,
and retain the existing one-answer/one-file rule for `phase:"check"`.

When the learner requests an invitation or next-step options, preserve these alternatives:
“Would you like to take your first quiz to see how well you understand your codebase?
Run `/up quiz`.” Then: “Or skip this introductory quiz and start `/up kata`.” On its
own line: “You can also use `/up on` next time you have an agent working.” Use `$up`
in Codex and the installed skill name when different. These invitations do not append
to the compact init summary and never make a quiz a prerequisite for kata/on.
