# Start a kata

Use for `/up kata`, a hint request during a kata, or abandonment. Read the evidence discipline in the parent skill. The CLI path below is the installed skill's `scripts/keepup.mjs`; `<CLI>` is a placeholder, not a shell executable. Use the main checkout returned by `init` for inspection and all kata commands.

## Recommend one useful problem

1. Run `status --json`, `architecture exercise list` and `architecture capabilities`.
   Read `<state>/MISSION.md` and `<state>/config.json`. Inspect listed architecture
   contexts; handle an active ordinary kata or started architecture exercise first:
   resume its frozen contract or record the learner's explicit abandonment. Never
   retarget it. A draft/preparation is not delivered teaching or an active exercise.
2. Read the current health report/selected assessment IDs, `architecture list` and
   relevant `architecture inspect <id> --json` results. Consider all six dimensions:
   file health (available condition metrics), interface leverage (concrete caller
   obligation), seam integrity including cycles (actual graph findings), change
   locality (confirmed equivalent independent policy sites), navigability (the same
   exact comprehension question and necessary readable trail), and behavioural
   testability (a missing observable scenario through its intended interface).
   Missing/unavailable/stale evidence is a limitation, never zero findings or health.
3. Inspect the source, callers, imports, behavioural tests, actual learning evidence
   and previous ordinary/architecture exercises. Let the mission or actual next
   change justify the problem. Prefer one small useful improvement that fits one
   sitting. Top debt files are leads, not a mandatory destination. Between similarly
   suitable problems avoid repeating the previous module/technique; if only a repeat
   is useful, explain the limit and defer unless the learner requests a repeat.
   Never manufacture a target to rotate dimensions. Follow a dark dependency when
   it offers the safer useful exercise; otherwise orient the learner and explain
   the deferral. Keep target files closed for the learner until recall is complete.
4. Recommend **one** bounded problem: name its dimension, behaviour or exact question,
   logical subject, concrete source findings, mission relevance, intended improvement,
   allowed source/test scope, verification approach, invariants, selected guardrails,
   tradeoffs and stop condition. A smaller rating/count alone is not improvement.
   Keep necessary trust-boundary validation and intrinsic domain choices visible.
5. Route using this installation's capability result, not its assessment support.
   A supported family still needs target preparation: clean scoped files, an existing
   full behavioural command, sufficient current accepted evidence and the selected
   evaluator's prerequisites. Require complete supported graph evidence for seam or
   cycle work and every graph guardrail. An unrelated unavailable graph does not
   block a reviewed target that does not use it; explicitly retain unmeasured seam
   safety. Use `architecture opportunity inspect` for current applicability rather
   than treating captured historical readiness as current. Never downgrade a useful
   architectural problem into complexity merely because its evidence is missing.
6. If evidence/support is unavailable, offer one concrete assessment or preparation
   activity, explicit deferral, or no useful exercise with the actual reason. Do not
   log a start, exposure, quiz, practice or explain-back for a recommendation alone.
   Check installed capabilities again after workflow updates; existing contexts keep
   their original frozen contracts. Assessment attempts, measured dimensions, supported
   families and target readiness are four separate facts. Health's legacy
   `assessedDimensions` is the measured count; `attemptedDimensions` counts selected
   saved observations plus file-health measurement, with blocked unsaved attempts
   retained in the scope document. No dimension count proves this target ready.

For a supported architectural recommendation, follow
[the architecture exercise lifecycle](architecture-exercise.md) from preparation
through pre-quiz, start, learner edits, assess, post-quiz, explain-back and completion.
Do not use the ordinary start/submit payloads below. The installed locality contract
requires actual reviewed consolidation and preserved validation; unchanged complexity
can pass. Unsupported families remain assessment/preparation work until the installed
completion workflow supports them. The learner writes all target edits and any tests
explicitly permitted by that workflow; the teaching agent never supplies them.

## Prepare an ordinary file-health exercise

Use this route only when file health is the useful selected problem. Restrict to
level 1 rename/extract or level 2 control-flow simplification. Choose an available
metric with a current score **strictly below** an achievable numeric goal in `(0, 1]`.
Measure the goal itself: rename and guard clauses often leave complexity unchanged;
extraction must improve the worst-function score without moving the same problem.
If no useful measured target meets the constraints, explain that and record no start.

Check the existing test command, callers and minimum complete edit scope. If the
command is unset, ask for it and wait. Inspect both staged and unstaged changes with
`git status --porcelain -- <files>`; all proposed ordinary kata files must be clean.
Preserve unrelated edits. Suggest `git switch -c keepup/kata-<short-topic>`; leave
branch creation to the learner unless requested. Capture chosen paths, current commit
and content hashes for collision checks. Continue only when scope, callers, tests,
target metric and achievable goal are known.

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
