---
name: up
description: Keep up with your own codebase through full initial assessments, recall quizzes, learner-written refactoring katas, delayed checks and a cognitive-debt map.
argument-hint: "init | status | quiz | kata | on | map | submit | check"
disable-model-invocation: true
---

# keepup

Run the bundled CLI with Node from the learner's current repository. Resolve the script relative to this installed skill: `scripts/keepup.mjs`. Quote paths and pass event JSON as a single argument. Read the command's output before continuing; errors never count as successful evidence.

Use the state directory returned by CLI `init` wherever a workflow says `<state>`. New repositories use `.keepup`; existing `.cogdebt` repositories keep their history in that directory. Never assume the directory name or move/merge learning state yourself.

The learner owns target-code edits. Teach, inspect and run the existing tests; never implement their refactor, create tests to make their kata pass or infer understanding from open files, elapsed time or another agent's work.

## init

1. Run `node <skill>/scripts/keepup.mjs init`. Inspect the returned configuration and scope. Leave an unknown test command unset until an exercise needs it, then ask for the existing command.
2. Read `MISSION.md` in the returned main-checkout state directory. Init supplies a starter mission or preserves an existing personalised mission. Use it immediately; a starter mission can be tailored after a week. Init requires no mission questions. Refine it immediately only when the learner asks.
3. Run [the full initial assessment](references/initial-assessment.md). Complete all six assessment attempts before reporting setup ready; save explicit blockers for unavailable evidence in the report. Use the CLI's `health` result for **Code health** (×100, out of 100) and **Comprehension debt** (×100, a percentage). Keep dimension breakdowns, coverage, blockers, warnings and provisional-review details in the saved report. Null means unavailable. Setup and assessment grant no quiz or practice credit.
4. Finish with only this setup summary, using the actual CLI scores:

   ```text
   Set up complete.

   Code health: <score>/100 (partial: <measured> of 6 dimensions)
   Comprehension debt: <debt>% · unassessed
   ```

   Include the partial qualifier only when the assessment is incomplete. Use `unavailable` for null scores. Include `· unassessed` only when the learner has no quiz evidence; preserve existing learning evidence. Keep assessment details in the saved report and wait for the learner's next request.

## quiz

For a first or standalone comprehension quiz, read [the quiz workflow](references/quiz.md). This samples understanding without requiring a refactor or granting practice.

## Mission refinement

On the first `status` or `on` invocation in a conversation, read [mission refinement](references/mission.md). This is an optional invitation after the starter's first week; continue normal learning when it is not selected or the learner declines.

## status and map

Run `health` for the combined score and saved assessment plan; run `status --json` for file-level decisions. The raw status code-health field describes file scorers, not the combined architecture score. Keep code health separate from cognitive debt. Surface stale/unavailable assessments, scorer warnings and partial coverage. Refresh affected architecture evidence through the initial-assessment workflow when requested; missing results never become healthy scores.

Run `map` to generate and open the map. If opening fails, give the generated path. The HTML includes its data but loads pinned d3 from a CDN, so rendering needs network access.

## Evidence discipline

The CLI's `log` command is the only event writer. Use a fresh retry ID for each genuine new action; reuse that ID and identical payload if retrying an interrupted call. The CLI supplies protected metadata and snapshots. Record the learner's actual words and answers; keep selection, presentation and acknowledgement separate. Log `shown` only after the learner has received the card. A response alone never grants quiz correctness.

## kata

For `/up kata`, hint requests or abandonment, read [the kata workflow](references/kata.md) before selecting a target or logging an event. Select one useful problem across all six dimensions before choosing its evaluator. Query `architecture capabilities` for this installation; supported families still require target-specific preparation.

## check

Follow [the delayed-check workflow](references/check.md). Ask one due question, wait for the actual answer and record it through the CLI. Never manufacture retention evidence.

## submit

For `/up submit`, read [the submit workflow](references/submit.md). Assess the stored kata baseline, existing tests and all touched-file metrics before recording practice.

## on

For `/up on`, read [the interactive learning workflow](references/on.md). Offer one item, wait for the learner's response, then continue until they say “stop”. This runs in the current conversation, including a second terminal; it installs no hook or background watcher. Record only actual presentation and the learner's response.

## architecture

For module interface assessments, read [the architecture workflow](references/architecture.md).
Use `architecture record <json>`, `inspect <id> [--json]`, `list` and `report <id>`.
For automated seam rules, use `architecture analyse <json>` with the explicit pinned analyser prerequisite in that workflow. For cycles, declare the optional runtime/type policy and exact group exceptions; inspect complete evidence paths and raw cyclic-group counts. Preserve raw violations, graph coverage, rule identities and source locations; reports alone never prove learning.
Keep reviewed architecture judgements separate from file scores and learner understanding.
For a bounded improvement recommendation, read the opportunity section in that workflow.
`architecture opportunity record|inspect|report` preserves supplied context and
readiness limits. Offer assessment, preparation, deferral or no work when warranted.
For opt-in architecture prepare/start/assess/complete, read [the exercise workflow](references/architecture-exercise.md).
For planned renames, additions, consolidation or physical module splits/merges, freeze the explicit reviewed transformation in that workflow before any questions. Never infer mappings from completed edits or transfer old verification to a new path.
Only actual linked pre-quiz answers can start a frozen architecture exercise. Only accepted objective checks plus actual linked post answers, explain-back and invariant review grant practice; delayed verification remains separate.
For reviewed change locality, use the same workflow's Change locality section. Confirm
semantic equivalence before accepting rules; preserve required validation at each trust
boundary. Affected owners and Git co-change never substitute for independent-site evidence.
Interface leverage and navigability have [caller-obligation](references/interface-exercise.md)
and [fixed-question](references/navigation-exercise.md) completion contracts in that lifecycle.
For behavioural testability, execute existing selected tests with `architecture testability
<json>` and inspect stored results. Review outcome assertions through the intended interface;
retain dependency compatibility checks and fixed scenario inventories. A testability exercise
can explicitly prepare learner-authored tests and mapped new paths, preserving the original
regression suite and capturing additional execution separately. The learner writes those
tests; never author tests or refactors to make their exercise pass.
For navigability, record fixed exact questions and reviewed sufficient implementation
trails via `architecture record`. Count necessary module transitions, never browsing
history. Incomplete/ambiguous trails and giant-file concealment stay unavailable; hidden
private helpers add no penalty. Navigability describes where to look, not where policy
changes belong, and never proves learner understanding.
