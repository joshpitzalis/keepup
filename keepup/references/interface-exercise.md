# Complete an interface-leverage exercise

Use the [architecture exercise lifecycle](architecture-exercise.md) for a concrete
avoidable caller obligation. Prefer a bounded mission-relevant problem: for example,
a caller sequences begin/append/finish merely to save an order. The caller should
still choose the amount and observe the meaningful result and rejection behaviour.
A lower operation count or higher rating alone does not justify practice.

Before questions, inspect current source, all representative callers and unchanged
existing positive/negative tests. Record a reviewed `interface-leverage` assessment
with complete scenarios and an explicit avoidable obligation. Do not propose the
learner's implementation. Freeze the module/interface, representative scenarios,
caller evidence, intrinsic domain obligations, behaviour, allowed files, invariants,
tradeoffs and stop condition through `architecture exercise prepare` with:

```json
{"target":{"kind":"interface-leverage","scenarioId":"checkout","obligationKind":"ordering","obligation":"Begin, append and finish in order","goal":0}}
```

Use the exact original scenario ID, obligation kind and description. The target
counts that same avoidable obligation across the entire frozen scenario inventory;
removing it from one caller while leaving it in another cannot reach zero. Include
the actual module implementation and affected external callers in allowed `files`.
Include every scenario evidence file in `files` or `callers`; freeze tests as named
witnesses and the unchanged full regression command. Preserve necessary validation.
Prepare 3–5 concepts distributed across every file that may receive practice.

Capture actual pre-quiz answers and start on unchanged clean source as described in
the lifecycle. Explain the obligation and intended outcome without writing the
refactor or answers. The learner authors every change. Complexity need not improve.
An unrelated unavailable graph does not establish seam safety or block this target.
Graph guardrails and reshaping need separately supported preparation; defer those
requirements explicitly rather than ignoring them.

After submission, inspect the original source, candidate source, all callers and
the actual diff. Record a new reviewed interface assessment against the exact
candidate. Keep the same module/interface, scenario IDs, descriptions and evidence
files, every intrinsic domain obligation and every unrelated avoidable obligation.
Only the selected obligation disappears. Renaming it, transferring it to another
caller, deleting a difficult scenario or hiding orchestration in a wrapper fails.
A catch-all interface that removes meaningful amount/error choices also fails.

Submit `exercise assess` with actual learner attribution, `reviewedAssessmentId`
and the shared `semanticReview` shape documented in the lifecycle. Record the real
reviewer and rationale: why callers no longer own the selected obligation, where
the module owns it, and how meaningful domain decisions and outcomes remain intact.
Provide exact archived `before` and candidate `after` excerpts for every changed
file and actual source evidence for every frozen caller. Excerpts may include
unchanged surrounding code when needed to identify a valid additive module API;
they must differ and match actual captured source. Semantic review remains a
judgment, separate from automated source identity and full test execution.
For this family use `trustBoundaries:[]`; necessary validation is checked through
frozen behavioural invariants, source/caller review and positive/negative tests.

Actual module and affected external caller source must both change. Provisional,
incomplete or stale reviewed evidence cannot pass. A failed attempt preserves the
original baseline and the learner's edits. Run unchanged full regression tests and
all selected witnesses; a passing unrelated check cannot substitute for them.

After accepted assessment, retrieve different actual post questions on the same
frozen concepts and the learner's own explain-back. Review every invariant and use
`exercise complete`. Every changed practice file needs its own frozen/mapped concept
and linked pre/post answers; explanation alone does not supply missing recall.
The internal writer records exactly one accepted practice event. Unchanged callers
get no practice; immediate practice never grants delayed verification. Preserve old
ordinary kata and seam exercise contexts; abandon explicitly to change direction.
