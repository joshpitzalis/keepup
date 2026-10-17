# Submit a kata

Use for `/up submit`. Follow the parent skill's evidence discipline and work in the main checkout. The learner owns every refactor. The skill assesses tests, scorer guardrails and learning evidence; `log` records that assessment without independently executing tests.

For an active architecture context, use [architecture exercise submission](architecture-exercise.md), including the [interface-leverage contract](interface-exercise.md) for caller obligation removal or the [navigability contract](navigation-exercise.md) for the same exact question and a shorter sufficient implementation trail.
Change-locality completion requires reviewed actual source/caller consolidation,
necessary validation, unchanged full regression checks and linked learner evidence;
do not apply ordinary file-metric improvement rules or log an ordinary kata pass.

## Recover context and freeze the assessment

1. Run `status --json` and select the learner's active kata from `status.katas`. If none is active, report that and stop. If several exist, ask which one. Retain its number, files, target, starting `sha`, complete `baseline.files`, `baseline.contentHashes`, `baseline.definitionHashes`, summaries, metrics, warnings and linked pre-quiz answers. Missing baseline or pre-quiz concepts is incomplete context; explain the gap and do not fabricate it.
2. Read the configured existing test command. A missing command cannot pass. Ask for the real command rather than substituting a trivial one. Keep the original baseline across failed attempts. Before guardrails, hash the exact bytes of `<state>/config.json` and every current executable regular file in `<state>/scorers/`, plus `scorers/complexity.mts` when present; compare the complete relative-path/hash map (`config.json`, `scorers/<name>`) with `baseline.definitionHashes`. A missing baseline map, changed bytes or added/removed scorer source or executable fails comparability: preserve the baseline and require a fresh kata under the current definitions rather than replacing its baseline. Include this same full map in every stability recheck.
3. Identify **all touched files**, including committed edits: compute SHA256 of exact current bytes for the union of baseline paths and current scoped paths, then compare with `baseline.contentHashes`. Missing baseline paths are deletions; current paths absent from the baseline are additions. Use `git diff --name-status <starting-sha> --`, staged/unstaged status and untracked paths to surface other changes, including paths that moved outside scope. Exclude learning-state/generated-map changes from kata source changes. A baseline file whose current hash still matches is unchanged even if it was already dirty at start. An unavailable starting commit or an untracked/out-of-scope change with no baseline is an explicit assessment gap, not proof of safety.
4. Show the changed files and commit changes. Ask the learner to confirm which edits are theirs; specifically surface edits outside declared kata files, unexpected commits and concurrent-agent changes. An expected target edit alone is not a collision. Wait for attribution when uncertain; preserve all edits. A source change outside the kata's declared files cannot silently join this kata. Missing/new/deleted/out-of-scope files without comparable scores prevent a pass; explain the constraint without reverting other people's work.
5. Record an assessment manifest of current exact-byte hashes, current tracked/untracked path inventory, commit, configuration and scorer source/executable hashes. Compare it after tests, after scoring and immediately before the pass event. Any change invalidates this assessment: identify the changed paths and rerun guardrails against stable content. A file changing while the learner answers the quiz also requires reassessment. Keep this manifest and command outputs in session scratch space, outside the repository.

## Execute objective guardrails

Run the configured existing test suite from the main repository root, with its normal environment and full command. Preserve the exit code and useful output. A timeout, signal, unavailable executable, nonzero exit or incomplete run is a failed test guardrail. Report the cause; leave the learner to fix their code. Do not weaken the suite, add kata-specific passing tests or edit the refactor.

Run `status --json` again to rerun every configured scorer. Retain this assessed status separately from later status calls. Check the content manifest again and report each guardrail independently:

- **Tests:** complete existing command exits zero.
- **Target:** the same target file/metric is available, improved from its stored baseline, and is at least the stored numeric goal. Report baseline → current → goal and raw details when available.
- **Other metrics:** for every touched source file, compare **every individual metric** present in either its baseline or current results. Every required pair must exist, and current value must be at least baseline value. Include other functions/files indirectly affected by the edit; averages cannot hide a regression. Any decrease fails, even if the targeted metric improves.
- **Comparability:** added/deleted files, missing metrics, changed scorer/config definitions, or unavailable baseline/current scores are unavailable comparisons and fail this guardrail. Scorer execution/parse errors affecting required results fail honestly; unrelated unscored untouched files are not a metric regression. Display warnings explicitly rather than translating them into passes.
- **Attribution and stability:** declared files and learner-confirmed changes agree, and the same content was tested and scored. Unresolved collisions or changes during assessment prevent a pass.

If any guardrail fails, report all results available, log `kata_submit` with `result:"fail"` and descriptive `checks`, and leave the kata active for another attempt. Do not grant practice or discard baseline context. A missing/deleted declared file may prevent the CLI from accepting a submission event; report that rejection and preserve the active kata rather than substituting another file. Already-collected actual quiz evidence remains valid, but no pass is earned by an incomplete assessment.

## Retrieve learning

After objective guardrails pass, retrieve this kata's linked `phase:"pre"` answers. Ask 3–5 **different questions on the same concepts**, using predict/trace/impact/why questions checkable against the final code. Keep files closed for the learner. Use the option rules in [the kata workflow](kata.md): equal whitespace-word counts within each question, varied correct positions, identical formatting and no answer-key clues. Preserve concept labels so comparisons are possible. Wait for actual answers and clarify ambiguity before grading.

Log the answers with `phase:"post"` and the active `kataNumber`; include each actual full question/options, response, correctness, concept and file. Include only answered files in the event's `files`. Example shape with illustrative placeholders:

```json
{"id":"unique-post-attempt","type":"quiz","files":["src/example.ts"],"phase":"post","kataNumber":1,"answers":[{"file":"src/example.ts","concept":"early return","question":"Different question and options on the same concept","answer":"Learner's actual response","correct":true}]}
```

Match pre/post evidence by file and concept. Name each misconception: a specific wrong-before/right-after concept, with the prior mistaken belief and corrected understanding. Report still-wrong concepts too; do not count an omitted answer as correct or claim that different questions are interchangeable test items. Show pre/post correct counts and percentage-point change as descriptive quiz results; post answers retain the CLI's half weighting. The PRD supplies no quiz pass threshold: do not invent one or award delayed verification for immediate recall.

Ask the learner to close the files and write **2–3 sentences** explaining the changed behavior/invariant, focused on their corrected misconceptions. If none were corrected, focus on a still-weak or central concept and say so. Wait for the learner's actual explanation; ask for revision if it misses the requested length or topic. Log their exact accepted words:

```json
{"id":"unique-explain-attempt","type":"explain","files":["src/example.ts"],"kataNumber":1,"text":"The learner's actual two or three sentences."}
```

Neither a model-written explanation nor a suggestion accepted silently counts as an explain-back. Pausing before quiz/explanation completion leaves the kata active; do not log a pass.

## Record and report

Recheck the assessment manifest immediately before a pass. If content, scorer definitions, configuration, inventory or commit changed, rerun objective guardrails; update questions/explanation if the change affects their concepts. Do not assess old code and snapshot new code.

Log the completed assessment once, using the original declared kata files and its real number. `checks` preserves the actual command/exit code, per-file metric comparisons, attribution and stability results; the following is only a shape, not proof to copy:

```json
{"id":"unique-submit-attempt","type":"kata_submit","files":["src/example.ts"],"kataNumber":1,"result":"pass","checks":{"tests":{"command":"actual configured command","exitCode":0},"target":{"metric":"complexity","baseline":0.5,"current":0.8,"goal":0.8},"otherMetrics":"actual per-file comparisons","attribution":"learner confirmed declared edits","stable":true}}
```

Use `result:"fail"` and actual failed checks for a failed assessment. Reuse the same action ID/payload only to retry that event; a genuinely new submission attempt gets a new ID. Read the accepted event before reporting completion. Only an accepted pass closes the kata, snapshots final declared files and grants practice. A fail remains active; abandonment follows the kata workflow.

Run final `status --json`. Report:

- Pass/fail for each guardrail and overall assessment; any logging rejection separately.
- Target and other-metric changes, test outcome and warnings.
- Pre/post quiz results, corrected misconceptions, remaining weaknesses and the recorded explain-back.
- Code health and cognitive debt **relative to the kata's stored baseline.summary**, using current minus baseline in percentage points; print unavailable when either value is null. The latest `status.delta` compares adjacent status calls and is not the kata delta.
- Resulting state and whether the kata remains active. Practice is immediate evidence; delayed verification still requires a qualifying later check.
