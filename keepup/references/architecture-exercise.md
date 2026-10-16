# Complete a learner-owned architecture exercise

Use this opt-in workflow for a deterministic seam repair on existing files.
Ordinary small katas keep their existing rules. Work in the main checkout returned
by `init`; linked worktrees share that source and its resolved `.keepup` or legacy
`.cogdebt` directory. Never change an existing active kata or its scoring setup.

## Choose and freeze before asking questions

Inspect a **current, complete automated seam assessment** and its actual callers,
implementation and tests. A reviewed rating, opportunity or partial graph cannot
start an exercise. Opportunity selection is optional: start directly from a useful
private import, forbidden direction, interface re-export or prohibited cycle.
Choose a bounded repair whose complete raw target can plausibly reach zero while
preserving behaviour. If that cannot be justified, offer preparation or no exercise.

For an edge finding, `kind`, `ruleId`, `source` and `destination` point to the
original finding, but the target counts **all violations of that frozen rule**.
Include every currently violating source in the allowed files. Rerouting to another
private member, shifting the import to a sibling consumer or laundering it through
a re-export cannot satisfy the same constraint. Cycle targets name the complete
original logical module group; every prohibited cycle intersecting those subjects
still counts, even when groups expand, merge or split.

Declare the existing files, relevant callers, technique, behaviour, behavioural
invariants, selected structural guardrails, anticipated tradeoffs and stop condition.
Guardrails name a frozen dependency rule or cycle policy and retain its individual
raw baseline. Other reviewed dimensions remain advisory; no aggregate can excuse
behavioural regression, removed validation or a broken selected constraint.

Initial behavioural verification supports an **already configured** explicit Node
suite: `node --test --test-reporter=tap <tracked test file paths>`. No wrappers,
globs, name filters or trivial commands qualify. The command runs unchanged and
must report positive completed checks, every test passing and none skipped,
pending or cancelled. Declare existing required `{file,name}` cases for the
invariants. Additional exact file/name witnesses prevent a passing same-named case
in another file from substituting for a missing check. They never replace the full
suite. Required named witnesses must be top-level Node tests; other runners are unavailable
until an appropriate adapter exists;
do not substitute a successful trivial command or author tests for this exercise.
Full runs have a 120-second/10MB output bound; named witnesses retain their existing
30-second bound. Report a bound or unsupported-runner failure honestly.

Run `architecture exercise prepare <json>`. Required fields:

- `id`, `assessmentId`, `files`, `callers`, `technique`, `behaviour`.
- `target`: `{kind,ruleId,source,destination,goal:0}` for an edge, or
  `{kind:"prohibited-cycle",ruleId,modules:[logical ids],goal:0}` for a cycle.
- `concepts`: 3–5 distinct `{file,concept}` entries within the declared files.
- `invariants`, `requiredTests:[{file,name}]`, `guardrails:[{ruleId,kind}]`,
  `tradeoffs` (explicitly empty when none anticipated), and `stopCondition`.

Preparation requires a commit, clean existing targets and no other active ordinary
kata or architecture context **across learners in this shared tree**. It freezes
complete source/caller/test inventories, definitions, evaluator and installed host
bytes, runtime, configuration and an environment fingerprint without exposing
secrets. It runs the real suite and witnesses and rejects changes during capture.
Initial exercises cannot add, delete, move or redefine members; reshaping remains a
separate later workflow. Preserve unrelated edits. Keep the returned preparation
and its CLI-owned `quizPrefix`; retries never replace this original baseline.

## Retrieve actual pre-quiz answers

Keep target files closed for the learner. Ask one predict/trace/impact/why question
per prepared concept, using the actual frozen code. Follow [the ordinary kata's
option rules](kata.md): equal whitespace-word counts, parallel formatting, varied
correct positions and no answer-key clues. Keep the key private. Wait for actual
responses, clarify ambiguity and grade against the code. Missing answers supply no
evidence; never manufacture a response or infer understanding from agreement.

Log the actual questions/options, exact responses, concepts and correctness through
the supported `log` writer with `type:"quiz"`, `phase:"pre"`, and only answered
files. Use IDs beginning with the returned `quizPrefix`; do not set `kataNumber`.
This prefix binds answers to this preparation without changing old event formats.
Actual quiz evidence may supply normal exposure; reports and exercise starts do
not grant practice. Example shape, with every placeholder replaced by real answers:

```json
{"id":"<returned-quizPrefix>actual-answer-attempt","type":"quiz","files":["caller.ts"],"phase":"pre","answers":[{"file":"caller.ts","concept":"public boundary","question":"Actual full question and options","answer":"Learner's exact response","correct":false}]}
```

Include all 3–5 actual answers in one or more events. Retry the same completed
logging operation with the same ID/payload; a genuinely new response uses a new ID.

## Start and present the task

After obtaining the learner's agreement, run `architecture exercise start` with
`{id:"unique-start-action",exerciseId:"prepared-id",preQuizIds:["actual-event-id"]}`.
The CLI verifies the real learner, context prefix, question concepts, original
commit and exact snapshots, then rechecks source, host/evaluator definitions,
environment and command, reruns the full suite/witnesses and freezes the accepted
start. Changes during the quiz reject the start without reverting code or rewriting
the baseline. Preserve real answers and explain the mismatch; obtain a fresh agreed
context when needed. A rejected start is not an active exercise.

Only after an accepted start, present the task card from `exercise inspect <id>` or
`exercise report <id> --no-open`: technique, complete raw target and goal, allowed
files, relevant callers, existing tests and required cases, invariants, selected
guardrails, anticipated tradeoffs and stop condition. Explain the constraint without
providing a ready-to-paste implementation. The learner owns every code and test edit.
Hints remain conceptual; surface unexplained commits or edits and obtain attribution
before assessing work. Never revert other people's edits.

## Assess actual learner work

Recover `exercise inspect <id> --json`. Show the learner every changed file and
commit against the original baseline, including staged/unstaged edits. Obtain their
actual attribution; never classify agent or unresolved work as learner-authored.
Preserve all code. Run `exercise assess` with
`{id,exerciseId,reason,attribution:[{file,author:"learner"|"agent"|"unresolved"}]}`.
Use a new action ID for each new assessment; identical retries return original evidence.
Only an exact inventory of changed, learner-attributed existing allowed files qualifies.
The CLI rejects additions/deletions, changed test files/command, out-of-scope edits,
changed evaluators, tracked executable/index modes and untracked inventory drift.
Pre-existing unrelated dirty bytes remain frozen and uncredited; unchanged baseline
dirt is not treated as new learner work. Candidate commits may differ from
baseline: only descendant linear commits authored and committed with the learner's
configured Git email and touching allowed files are supported. Merges, foreign
commits and unexpected paths are gaps. Git identity is an attribution aid, not proof
of who typed a change; obtain the learner's actual account before submitting it.

The CLI reruns the complete frozen Node TAP suite and exact named witnesses, then
fresh complete seam analysis under the original module/policy definitions. Raw
target must improve to zero; each selected rule/cycle guardrail must individually
stay at or below its raw baseline. Diluting edge denominators, endpoint rerouting,
interface re-exports and SCC expansion/splitting cannot hide a surviving target.
Missing/opaque analysis or missing/skipped/incomplete tests cannot pass. Inspect
each stored error and actual outputs. Failed attempts stay active and immutable;
the learner may repair and assess another attempt. Never alter code or tests for them.

Captured compatible reviewed before/after dimensions are reported as advisory,
including raw values and movement. Missing pairs remain unassessed; no semantic
ratings are invented or automatically recomputed. These judgements cannot excuse
behavioural failures or selected structural guardrails. A passing suite cannot prove
arbitrary correctness: review every frozen invariant, necessary validation and
actual diff against the existing positive/negative tests. If validation was removed,
an invariant cannot be justified, or coverage is inadequate, stop without practice;
offer separate preparation rather than weakening checks or inventing tests here.

## Retrieve understanding after objective success

An `awaiting-learning` attempt returns its own `quizPrefix` and exact candidate
HEAD/bytes. Keep files closed and ask **different** predict/trace/impact/why questions
on every original file/concept, following the same option rules as the pre-quiz.
Wait for real answers, clarify and grade them; never infer understanding from tests.
Log actual standalone `quiz`/`phase:"post"` events through `log`, with IDs starting
the attempt's prefix and no kata number. Every frozen concept must have one actual
answer. Candidate SHA/snapshots must match this attempt, including learner commits.
Report descriptive pre/post counts, wrong-before/right-after misconceptions and
still-weak concepts; no immediate quiz threshold is invented.

Ask for the learner's own two or three sentences explaining the changed invariant
and corrected or still-weak concept. Wait for their words and review length/topic;
do not write an explanation for them. Log the accepted exact words as standalone
`explain`, with the same attempt prefix, candidate HEAD and attributable changed
files. Explain events retain their existing format without snapshots: the CLI binds
the actual event to this attempt and rechecks the complete source inventory.

Run `exercise complete` with
`{id,exerciseId,attemptId,postQuizIds,explainId,invariantReview:[{invariant,preserved,evidence}]}`.
Each frozen invariant needs an explicit truthful review of the actual diff and
unchanged existing tests; any unresolved or rejected invariant prevents completion.
Evidence text records the learner/reviewer's actual reasoning, not an automatic
semantic score. All source, index, environment, evaluator/tool/host bytes and
configuration must still match the objective attempt across questions and completion.
Drift requires a new assessment and fresh linked learning evidence, never a replaced
baseline. No pass is recorded by merely presenting a report or an assessment.

The CLI first publishes immutable per-completion acceptance evidence, then calls
the existing supported learning writer internally. Only the authoritative matching
`architecture_pass` event closes the exercise and grants immediate practice to the
attributable changed files, with exact accepted snapshots. Untouched callers and
concept files gain no practice bonus. Public `log` rejects this event type, including
retries; do not manufacture an ordinary kata pass. An interrupted accepted record
without its event stays active: retry the same action against its exact source or
assess a new attempt and obtain new actual learning evidence. Concurrent retries
converge on one event per exercise; later identical retries return the original pass.

The old `exercise submit {id,exerciseId,reason}` remains a pending request, never a
pass. On explicit abandonment use `exercise abandon` with their reason: it closes
without practice and preserves code/history. After a pass, use the ordinary
[delayed check workflow](check.md) on the practiced concepts. Immediate practice
is not delayed verification; only a later actual qualifying check can establish it.
