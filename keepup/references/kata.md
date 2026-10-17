# Start a kata

Use for `/up kata`, a hint request during a kata, or abandonment. Read the evidence discipline in the parent skill. The CLI path below is the installed skill's `scripts/keepup.mjs`; `<CLI>` is a placeholder, not a shell executable. Use the main checkout returned by `init` for inspection and all kata commands.

Before selecting a file metric, consider current architectural findings and the
learner's mission. A useful confirmed duplicated policy can use the supported
[change-locality exercise](architecture-exercise.md#reviewed-change-locality-target),
with frozen source, representative behaviour, reviewed consolidation and unchanged
regression checks. It does not require improved complexity. Missing confirmed
policy evidence means preparation or deferral, never invented practice credit.

## Choose one safe exercise

1. Run `status --json`; read `<state>/MISSION.md` and `<state>/config.json`. If a kata is active in `status.katas`, offer to resume it or record the learner's explicit abandonment before starting another. If the existing test command is unset, ask for it and wait. Preserve unrelated edits.
2. Inspect the top ten debt files, their callers, imports and metrics. The agent may inspect code privately to prepare; ask the learner to keep target files closed until the pre-quiz is complete. Prefer small functions, few callers and one sitting of work. Follow a target's dark dependency first when it offers a safe measured exercise; otherwise orient the learner about that dependency and explain why the candidate was deferred. Among similarly sized/debt-ranked candidates prefer mission relevance. Exclude the last kata's module and technique. If that leaves no safe target, explain the constraint and offer no exercise unless the learner explicitly requests a repeat.
3. Restrict to level 1 rename/extract or level 2 control-flow simplification. Choose an available metric with a current score **strictly below** a plausible numeric goal in `(0, 1]`. Measure the actual goal, not a proxy: rename alone and guard clauses often leave complexity unchanged. Use extraction only where it can improve the worst-function score without moving complexity into another function. If no exercise meets the constraints, explain that no safe measured target exists; record no start.
4. Inspect both staged and unstaged changes with `git status --porcelain -- <files>`. All proposed kata files must be clean. Review callers and existing tests; choose the minimum complete file set the learner may need to edit. Suggest `git switch -c keepup/kata-<short-topic>`; leave branch creation to the learner unless requested. Capture the chosen paths, current commit and content hashes for collision checks.

Do not choose a target by debt alone. Complete this step only when the scope, callers, test command, target metric and achievable goal are known.

## Recall before opening

Ask 3–5 multiple-choice questions about the selected files. Include predict, trace, impact or why questions whose answers can be checked against the actual code; keep the answer key private until the learner responds. Give each question a specific concept label for the later post-quiz. Every option within a question must have the same whitespace-separated word count, parallel wording and identical formatting. Count the words before presenting. Vary the correct answer's position across the quiz. Avoid clues such as a uniquely qualified, detailed or formatted correct option.

Wait for the learner's answers. Grade against the code; retain each full question, the exact answer given, concept, file and boolean correctness. Clarify an ambiguous answer rather than guessing. Keep the actual answers pending until the clean recheck and successful start below; a pause or skipped question supplies no answer. Show which answers were correct, with a short explanation after grading. If the learner stops before answering, leave the kata unstarted.

## Start and present the task

Recheck cleanliness, commit and content hashes after the quiz. If anything changed, stop and identify it; choose a clean target or wait for the learner's decision. Log the start only after the learner has agreed to the exercise and completed the pre-quiz. Use all kata files in `files`; `target.file` must belong to them. `module` identifies the actual feature/directory; `technique` names the specific refactoring. Example shape:

```json
{"id":"unique-start-attempt","type":"kata_start","files":["src/example.ts"],"technique":"Extract Method","module":"src/example","target":{"file":"src/example.ts","metric":"complexity","goal":0.8}}
```

Read the returned event. The CLI assigns `kataNumber` and captures snapshots and a scored baseline. A rejected start is not an active kata; the real quiz answers may be logged standalone as evidence, but do not invent an active kata. Use this returned baseline when presenting the card; if scoring changed and the goal no longer makes sense, stop rather than guessing success.

Before presenting the card, log the already-collected pre-quiz answers with the returned `kataNumber`, so submit can retrieve their concepts and misconceptions from `status.katas[].quizzes`. Example shape below: replace every example string, include every actual answer, use precisely the answered kata files in `files`, and generate a fresh action ID. Pass serialized JSON as one argument to `node <CLI> log`:

```json
{"id":"unique-pre-attempt","type":"quiz","files":["src/example.ts"],"phase":"pre","kataNumber":1,"answers":[{"file":"src/example.ts","concept":"early return","question":"Actual question and options shown","answer":"Learner's exact response","correct":false}]}
```

The placeholder `false` is not a grading default. A new response attempt needs a new ID; retrying the same completed logging operation reuses its original ID and payload. If linked quiz logging fails, retain the answers and retry the same payload before proceeding to the card.

Present one card containing:

- Kata number, level, exact file/function and smell.
- Target metric, measured baseline and numeric goal; show how the threshold maps to raw CCN when applicable.
- Technique and its primary reference: [Extract Method](https://refactoring.guru/extract-method), [Rename Method](https://refactoring.guru/rename-method) or [Replace Nested Conditional with Guard Clauses](https://refactoring.guru/replace-nested-conditional-with-guard-clauses), according to the chosen technique.
- Files to open, relevant callers and dependencies, the existing test command, and behavior that must stay the same.
- “Write the refactor yourself. Ask for a hint, abandon, or run `/up submit` when ready.”

Use the **state before the quiz** to set briefing depth: dark → walkthrough, exposed → one paragraph, verified → one line, practised → no briefing. Keep any plain-text diagram within 30 columns and 12 rows; omit diagrams that do not help. Explain the smell and invariants without supplying a ready-to-paste solution.

After the learner receives the card, log `shown` for its actual files with the corresponding `depth`: `walkthrough`, `paragraph`, `line` or `none`. Example shape:

```json
{"id":"unique-card-attempt","type":"shown","files":["src/example.ts"],"depth":"walkthrough"}
```

The learner now owns the edits. Preserve the start context for submit; obtain the recorded context later through `status.katas`, rather than inventing another baseline.

## Hints, collisions and abandonment

On a hint request, reread the active context and current diff. Surface changes outside the declared files or unexplained commits and ask the learner which edits are theirs. An expected target edit alone is not a collision. If attribution is uncertain, pause assessment; do not revert files or assume agent edits count as the learner's work.

Give one conceptual hint, a question or a smaller inspection step. The learner still writes the refactor. Log the hint actually delivered, with the active kata number:

```json
{"id":"unique-hint-attempt","type":"hint","files":["src/example.ts"],"kataNumber":1,"text":"The actual hint delivered"}
```

On explicit abandonment, log the following shape with the active kata's real number and files, then report that the kata closed without practice credit. Preserve the learner's code and branch:

```json
{"id":"unique-abandon-attempt","type":"kata_submit","files":["src/example.ts"],"kataNumber":1,"result":"abandon"}
```

On submit, read the submit workflow linked from the parent skill.
