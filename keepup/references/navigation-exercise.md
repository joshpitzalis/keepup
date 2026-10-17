# Complete a navigability exercise

Use the [architecture exercise lifecycle](architecture-exercise.md) for a specific
comprehension question whose sufficient implementation trail crosses unnecessary
logical module boundaries. Inspect the actual code privately. Freeze the exact
question and owner before questions or learner edits; less browsing or fewer files
does not itself demonstrate improvement.

Prepare against a current reviewed `navigability` assessment with an unambiguous
owner, a complete sufficient trail, coherent readability and no unresolved review
disagreements. Use this target shape with the original question ID:

```json
{"target":{"kind":"navigability","questionId":"total-policy","goal":0}}
```

The goal counts nonnegative necessary logical-module transitions through the same
question's trail. It must strictly improve the original count. Do not count elapsed
time, browsing history or private helpers. Freeze the original module membership,
question text, owner, evidence files, trail step IDs/files/locations/module IDs/kinds,
behaviour, editable scope, existing tests, invariants, tradeoffs and stop condition.
Select an owning implementation file and freeze relevant external caller files
outside the editable scope. This supported contract cannot transfer work into callers.

Keep every original trail step in later reviewed inventories. A superseded step
can become `necessary:false` with the reviewer's actual explanation; removing it,
renaming it, reattributing its module or relabelling implementation as a private
helper cannot erase the original trail. Keep unselected questions unchanged.

Capture actual pre answers on 3–5 frozen file/concepts and start on unchanged clean
source. Every eventual practice file needs its own actual pre/post learning evidence.
Present the same conceptual task without writing the refactor. The learner owns all
code and answers. Renaming a pass-through without shortening the sufficient trail
does not satisfy the target.

After learner submission, inspect archived original and current owning source,
each original trail site, unchanged callers and actual diff. Record a new reviewed
assessment of that exact candidate, using the identical comprehension question.
The owner must contain a shorter sufficient implementation trail and remain readable;
a giant file that conceals navigation, ambiguous ownership, incomplete trail or
reviewer disagreement leaves completion unavailable. Reviewers must judge actual
source, not merely supply a better count or readability label.

Use `exercise assess` with actual learner attribution, `reviewedAssessmentId` and
the shared `semanticReview` shape. Record the real reviewer and rationale covering
the shorter sufficient trail, coherent internal readability, meaningful behaviour
and preserved caller obligations. Supply actual archived `before` and current
`after` excerpts for each changed implementation and actual source excerpts for
every frozen caller. For this family use `trustBoundaries:[]`; validation remains
subject to frozen invariants, source review and unchanged positive/negative tests.
The full unchanged regression suite and all named witnesses must pass on this exact
candidate. Numeric evidence and semantic acceptance remain separate in the record.

State accepted tradeoffs before editing. For example, making a short validation
and rounding policy explicit at its owning total can reduce transitions 1→0 while
retaining an old rounding helper for other consumers. That fixture increases raw
policy implementation sites 1→2; it claims navigability improvement only, with no
locality guardrail selected. If that duplication violates a selected guardrail,
defer or choose a different exercise. Unchanged complexity can qualify. An unrelated
unavailable graph neither blocks this target nor establishes seam safety. Selected
graph guards use the shared complete supporting-evidence contract. Source reshaping
requires separately supported preparation.

After successful assessment, ask different actual post questions on the original
concepts and retrieve the learner's own explain-back. Review each frozen invariant,
then use `exercise complete`; only accepted internal practice closes the context.
A stale source or failed attempt preserves the baseline and learner edits. Explicit
abandonment grants no credit and does not revert code. Unchanged callers get no
practice, and immediate practice never grants delayed verification.
