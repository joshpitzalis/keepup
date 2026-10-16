---
name: keepup
description: Keep up with your own codebase through short recall quizzes, learner-written refactoring katas, delayed checks and a cognitive-debt map. Use for /keepup status, kata, on, map, init, submit or check.
argument-hint: "status | kata | on | map | init | submit | check"
disable-model-invocation: true
---

# keepup

Run the bundled CLI with Node from the learner's current repository. Resolve the script relative to this installed skill: `scripts/keepup.mjs`. Quote paths and pass event JSON as a single argument. Read the command's output before continuing; errors never count as successful evidence.

Use the state directory returned by CLI `init` wherever a workflow says `<state>`. New repositories use `.keepup`; existing `.cogdebt` repositories keep their history in that directory. Never assume the directory name or move/merge learning state yourself.

The learner owns target-code edits. Teach, inspect and run the existing tests; never implement their refactor, create tests to make their kata pass or infer understanding from open files, elapsed time or another agent's work.

## init

1. Run `node <skill>/scripts/keepup.mjs init`. Inspect the returned configuration and scope. If `testCommand` is null, ask which existing test command to use; leave it unset until answered. Explain where the learner can correct include/exclude globs.
2. Read `MISSION.md` in the returned main-checkout state directory. If substantive answers already exist, preserve them. Otherwise interview for **why**, **success**, **constraints** and **out of scope**. Ask one useful question at a time. Challenge vague goals such as “understand everything” with a concrete prompt: “Which product conversation or code change do you want to handle without opening the code?”
3. Summarise the learner's answers in those four sections, within one screen. Write only what they supplied or confirmed. An unanswered template is not a completed mission.
4. Report setup and missing inputs clearly. Recommend committing learning state; the generated map alone is ignored. Rerunning init preserves prior state.

## status and map

Run `status` for readable output or `status --json` for decisions. Keep code health separate from cognitive debt. Surface unavailable scores, scorer warnings and partial scored-line coverage; never translate missing results into healthy code.

Run `map` to generate and open the map. If opening fails, give the generated path. The HTML includes its data but loads pinned d3 from a CDN, so rendering needs network access.

## Evidence discipline

The CLI's `log` command is the only event writer. Use a fresh retry ID for each genuine new action; reuse that ID and identical payload if retrying an interrupted call. The CLI supplies protected metadata and snapshots. Record the learner's actual words and answers; keep selection, presentation and acknowledgement separate. Log `shown` only after the learner has received the card. A response alone never grants quiz correctness.

## kata

For `/keepup kata`, hint requests or abandonment, read [the kata workflow](references/kata.md) before selecting a target or logging an event.

## check

Follow [the delayed-check workflow](references/check.md). Ask one due question, wait for the actual answer and record it through the CLI. Never manufacture retention evidence.

## submit

For `/keepup submit`, read [the submit workflow](references/submit.md). Assess the stored kata baseline, existing tests and all touched-file metrics before recording practice.

## on

For `/keepup on`, read [the interactive learning workflow](references/on.md). Offer one item, wait for the learner's response, then continue until they say “stop”. This runs in the current conversation, including a second terminal; it installs no hook or background watcher. Record only actual presentation and the learner's response.

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
Only actual linked pre-quiz answers can start a frozen seam repair. Only accepted objective checks plus actual linked post answers, explain-back and invariant review grant practice; delayed verification remains separate.
For reviewed change locality, use the same workflow's Change locality section. Confirm
semantic equivalence before accepting rules; preserve required validation at each trust
boundary. Affected owners and Git co-change never substitute for independent-site evidence.
For behavioural testability, execute existing selected tests with `architecture testability
<json>` and inspect stored results. Review outcome assertions through the intended interface;
retain dependency compatibility checks and fixed scenario inventories. Missing tests are
separate preparation work: never author tests to make a learner exercise pass.
For navigability, record fixed exact questions and reviewed sufficient implementation
trails via `architecture record`. Count necessary module transitions, never browsing
history. Incomplete/ambiguous trails and giant-file concealment stay unavailable; hidden
private helpers add no penalty. Navigability describes where to look, not where policy
changes belong, and never proves learner understanding.
