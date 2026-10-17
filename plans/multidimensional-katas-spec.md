## Problem Statement

A learner asks for a useful refactoring exercise after Keepup has assessed six dimensions of their codebase, but receives another complexity exercise. The ordinary kata workflow selects an installed file metric, while architectural practice supports only deterministic seam repairs. Interface leverage, change locality, navigability and behavioural testability can inform reports without supplying a supported route to completed practice.

This makes the assessment promise broader than the learning experience. It also makes coverage ambiguous: six dimensions attempted, four dimensions measured and two dimensions supported for practice can be mistaken for the same count. The learner needs to understand what the system assessed, what it could measure and what they can actually practise.

## Solution

Make `$up kata` select a useful learning problem first, then choose the evidence needed to assess it. Recommend one bounded exercise from the current assessments, the learner's mission, their learning evidence and their previous exercises. Complexity remains an available file-health target; it is not the default destination when architectural evidence is missing.

Use the existing preparation, frozen scope, pre-quiz, learner edits, assessment, post-quiz and explain-back lifecycle. Support a completion contract for each of the six assessment dimensions, with automated evidence and reviewed judgments identified separately. Missing prerequisites lead to a concrete assessment or preparation activity, an explicit deferral, or no useful exercise. They do not produce fabricated readiness or practice credit.

The first delivered exercise family should be change locality. Consolidating the independently maintained post-quiz weighting rule provides a real rehearsal in which complexity can remain unchanged. The feature is complete only when all six dimensions have supported selection and completion behaviour, not when locality alone works.

## User Stories

1. As a learner, I want kata selection to consider all six assessment dimensions, so that practice addresses useful problems across my codebase.
2. As a learner, I want recommendations tied to my mission, so that I understand why a particular problem deserves my attention.
3. As a learner, I want one bounded recommendation at a time, so that I can start without choosing from a large backlog.
4. As a learner, I want the recommendation to name the behaviour, evidence and intended improvement, so that I can judge its value before committing.
5. As a learner, I want prior exercises considered, so that I do not repeatedly receive the same module and technique when another suitable exercise exists.
6. As a learner, I want selection to prefer useful work over a dimension rotation quota, so that variety does not manufacture unnecessary refactoring.
7. As a learner, I want to improve file health using an available condition metric, so that complexity remains useful when it matches the problem.
8. As a learner, I want to improve interface leverage by removing a particular caller obligation, so that callers express intent with less implementation knowledge.
9. As a learner, I want to repair a frozen dependency violation or prohibited cycle, so that implementation relationships follow the intended module policy.
10. As a learner, I want to consolidate genuinely equivalent policy sites, so that one policy change has one authoritative implementation where appropriate.
11. As a learner, I want necessary validation preserved at each trust boundary, so that consolidation does not remove safety checks merely to improve a count.
12. As a learner, I want to simplify the implementation trail for the same comprehension question, so that navigability improvements remain comparable.
13. As a learner, I want readability considered alongside module transitions, so that moving everything into a giant file does not count as an improvement.
14. As a learner, I want to verify a previously unsupported behaviour through its intended interface, so that testability practice closes an actual coverage gap.
15. As a learner, I want to write the tests needed for a testability exercise myself, so that the exercise teaches verification rather than having the agent do my work.
16. As a learner, I want the existing regression suite preserved during testability work, so that new passing tests cannot replace tests that expose a regression.
17. As a learner, I want useful architectural practice to succeed when complexity is unchanged, so that the selected dimension determines success.
18. As a learner, I want anticipated tradeoffs and selected guardrails stated before editing, so that completion rules do not change after my work.
19. As a learner, I want missing or stale evidence explained, so that unavailable results are not presented as healthy or ready.
20. As a learner, I want a small assessment or preparation activity when a useful exercise is not ready, so that I can address the actual obstacle.
21. As a learner, I want unrelated missing graph evidence kept separate from a locality exercise, so that prerequisites reflect the selected target and guardrails.
22. As a learner, I want actual recall questions before opening the target files, so that the baseline describes my understanding rather than recognition.
23. As a learner, I want to write every exercise refactor myself, so that practice credit describes my work.
24. As a learner, I want changed files and attribution checked against the frozen baseline, so that another agent's work cannot count as mine.
25. As a learner, I want tests and evidence captured against the exact candidate source, so that results from different versions cannot be combined into a pass.
26. As a learner, I want automated measurements distinguished from reviewed judgments, so that I understand what each result establishes and what it does not.
27. As a learner, I want reviewed improvement backed by the actual source, callers and diff, so that changing assessment metadata alone cannot earn credit.
28. As a learner, I want different post-quiz questions on the original concepts, so that immediate understanding is checked after the work.
29. As a learner, I want to explain the changed invariant in my own words, so that a passing tool run is not substituted for understanding.
30. As a learner, I want failed attempts to retain their original baseline, so that I can revise my work without rewriting history.
31. As a learner, I want explicit abandonment to preserve my code and close without credit, so that changing direction does not destroy work.
32. As a returning learner, I want old kata and architecture exercise records to retain their original meaning, so that new feature support does not alter past credit or active contexts.
33. As a learner, I want attempted assessments, measured dimensions, supported exercise families and current exercise readiness shown separately, so that a count such as 2/6 is understandable.
34. As a learner, I want immediate practice separated from delayed verification, so that an exercise does not claim long-term retention.
35. As a maintainer, I want copied skill installations to support the same workflow as the development checkout, so that a local-only success does not become a misleading release.
36. As a maintainer, I want the shipped teaching guidance and completion logic updated together, so that agents recommend exercises the installed product can actually complete.

## Implementation Decisions

- Keep the existing six assessment dimensions: file health, interface leverage, seam integrity including cycles, change locality, navigability and behavioural testability. Do not add a new aggregate score to select or pass an exercise.
- Separate four concepts in selection and reporting: assessment attempted, dimension measured, exercise family supported by the installed workflow, and a particular exercise ready to start. Give the reason and scope for unavailable results. Historical reports retain their original recorded values.
- Select from current findings and concrete source evidence. Consider the learner's mission, actual learning evidence, scope, callers, dependencies, test readiness and previous exercises. Prefer the smallest useful problem that fits one sitting. Rotation is a preference between suitable candidates, not a quota or a reason to invent work.
- Preserve active-context handling before selecting another exercise. A draft or recommendation is not an active exercise, delivered teaching or learner evidence. Existing contexts keep their frozen contracts; do not silently retarget or migrate them.
- Extend the existing architecture exercise lifecycle for architectural targets. Keep legacy ordinary kata behaviour and saved records compatible. Prefer additive target contracts and existing evidence storage, locking, retry identity, snapshots and internal practice writing over a second lifecycle.
- A target freezes the dimension, logical subjects, representative behaviour or question, applicable rule/scenario identities, baseline evidence, allowed source/test changes, improvement criterion, invariants, selected guardrails, tradeoffs and stop condition before questions or edits. Prevent denominator dilution, dropped hard scenarios and changed questions from satisfying the original target.
- Treat readiness as target-specific. Require complete graph evidence for seam/cycle targets and any graph-based guardrail. Preserve current complete-analysis requirements until a separately supported evaluator can establish sufficient coverage. An unrelated partial graph alone does not block locality, interface, navigation or testability work that does not depend on it; retain the limitation and do not claim unmeasured seam safety.
- File-health exercises improve the same available condition metric against their frozen baseline. Existing ordinary katas retain their existing comparability and non-regression semantics. New architectural exercises do not require a complexity improvement unless complexity is an explicitly selected target or guardrail.
- Interface-leverage exercises freeze a concrete caller obligation and representative caller scenarios. Completion must demonstrate that the obligation disappeared from callers and is owned appropriately by the module, while retaining intrinsic domain choices and meaningful outcomes. A smaller operation count or higher rating alone is insufficient.
- Seam-integrity exercises retain deterministic whole-rule or original-cycle-subject targets and selected raw guardrails. Rerouting to another private member, re-export laundering, changed exceptions, and SCC expansion or splitting cannot erase a surviving target.
- Change-locality exercises freeze confirmed semantic equivalence and the independently maintained implementation sites for a named policy. Distinguish calls to a shared implementation from independent policy sites. Completion requires reviewed source evidence that the equivalent policy was consolidated, plus behavioural verification and explicit review of necessary trust-boundary validation. Lower supplied site counts, file merging and textual similarity alone are insufficient.
- Navigability exercises retain the exact comprehension question, owning module and reviewed sufficient implementation trail. Completion requires a shorter necessary trail and coherent internal readability without transferring avoidable obligations to callers. Renaming without the selected improvement, deleting evidence, obscuring ownership and giant-file consolidation do not qualify.
- Testability exercises freeze a previously unsupported behavioural scenario, its failure invariant, intended interface and dependency compatibility requirements. Explicitly allow learner-authored tests and the minimum supporting implementation changes within prepared scope. Preserve the existing regression test bytes and command; capture the agreed additional test execution separately. Completion needs actual selected execution, reviewed observable-outcome assertions through the intended interface and required compatibility checks. Helper-only, interaction-only, empty, skipped or trivial passing tests do not establish the selected behaviour.
- Keep semantic evidence visibly reviewed. Agents may propose assessments and collect source evidence, but provisional, disputed or incomplete judgments cannot silently become accepted completion evidence. Record the actual reviewer, rationale and before/after source basis. A better agent-assigned score alone never grants practice.
- Reuse exact-source capture, clean target checks, attribution, full required tests, stable definitions, retries and source/index/environment checks where applicable. Reject changed tests outside explicitly prepared testability work, out-of-scope edits, unsupported transformations, unexplained commits and mixed-source evidence without reverting learner edits.
- Completion combines the dimension-specific evidence, passing behavioural checks, preserved invariants and selected guardrails, actual linked post answers and the learner's explain-back. Keep objective tool results and reviewed acceptance separate in the record. Use the supported internal practice writer only after acceptance; do not manufacture ordinary kata passes for unsupported exercise families.
- Practice belongs only to attributable learner-authored changed files eligible under the existing learning model. Unchanged callers gain no practice bonus; new or moved paths require explicit prepared mapping and their own actual learning evidence. Delayed verification remains a separate later event.
- Learner state remains outside product-development fixtures. Implement and rehearse in disposable repositories. Updating or testing the skill must not rewrite the operator's learning history, config, scoring definitions or exercise baseline.
- Update selection, submission, architecture exercise guidance and installation-facing capability descriptions together. Guidance must state actual installed support and remaining preparation requirements rather than imply that assessment alone supplies an executable kata in every dimension.

## Testing Decisions

- Prefer the existing public CLI seam exercised against disposable real Git repositories. Assert returned outcomes, persisted evidence, source snapshots, actual executed tests and credit/state transitions. Avoid coupling tests to private helper arrangements or matching prose as a proxy for teaching behaviour.
- Reuse the current public CLI fixture style, copied-installation checks, immutable evidence tests, source-race tests and architecture exercise lifecycle rehearsals. Use the real pinned analyser for relevant seam cases; controlled failures may test unavailable evidence but cannot stand in for a successful real analysis.
- Add one complete prepare, pre-quiz, start, learner change, assess, post-quiz, explain-back and complete acceptance journey for each dimension. At least one architectural journey must pass with unchanged complexity. Confirm that no credit is granted before all required evidence exists.
- Exercise selection through realistic teaching rehearsals using the shipped skill and fixed repository evidence. Cover a mission-relevant architectural choice despite worse file metrics elsewhere, a suitable file-health choice, repeated-module/technique avoidance, and no useful ready exercise. Judge the actual recommendation and subsequent actions, not keyword matches in guidance.
- Verify readiness and count semantics independently: six attempted but fewer measured; assessed but unsupported practice; supported but currently blocked exercise; all six supported with target-specific readiness. Missing data must stay unavailable rather than becoming zero findings or healthy defaults.
- For reviewed dimensions, keep the subject inventory fixed and test rejected superficial improvements: changed ratings only, omitted policy sites without a source consolidation, file merging, renamed questions, dropped scenarios, misleading pass-through removal and obscured internal readability. A valid change must show actual source improvement plus the required review.
- Verify necessary trust-boundary validation using positive and negative behavioural cases and explicit review of removed or relocated checks. A lower raw count cannot excuse a failed invariant or missing validation.
- For testability, cover permitted learner-written tests and preserved baseline regressions, removed/altered regression tests, helper-only assertions, interaction-only assertions, missing compatibility checks, unavailable discovery, and tests that skip or run zero meaningful cases. The teaching agent must not author tests or the target refactor for the learner.
- Preserve historical ordinary katas and architecture records. Cover legacy state resolution, old canonical payloads, active-context conflicts, immutable retries, changed definitions, stale assessments, failed attempts, explicit abandonment, interrupted acceptance and unsupported/new/moved paths.
- Verify attribution and stability across source edits, staged changes, commits, assessment, questions and final credit. Agent-authored or unresolved work cannot receive learner practice.
- Rehearse the change-locality journey using the post-quiz weighting example. Demonstrate that both learning-state and delayed-check outcomes are preserved and the policy has one authoritative implementation. This rehearsal is product verification in a disposable repository, not practice credit for the operator.
- Run the repository's required focused and integration checks against the final implementation and preserve its verification receipts. Label automated checks, teaching rehearsals and any browser execution separately. No new browser test seam is necessary unless the accepted user-facing scope changes the browser reports or map.

## Out of Scope

- Agent-written learner refactors, tests, quiz answers, explain-backs or fabricated review evidence.
- Automatically inferring semantic equivalence, interface depth, readability or learner understanding from counts, ratings, browsing history or elapsed time.
- A new scoring leaderboard, weighted cross-dimension pass score, mandatory rotation schedule, or hotspot engine.
- Improving dependency-cruiser resolution, adding language/test-runner adapters or suppressing analyser warnings to manufacture complete coverage. Relevant unsupported evidence stays an explicit limitation.
- Relaxing necessary validation or behavioural invariants to improve an architecture score.
- Rewriting old learning events, silently replacing active baselines, changing old kata pass rules, or automatically upgrading the operator's installed skill/state during development.
- Implementing the learner's post-quiz weighting refactor in the active checkout as part of building this feature.
- A new browser interface or report redesign. Preserve existing presentation and add only the capability/readiness distinctions needed by this workflow.

## Further Notes

The original architecture scope intentionally allowed executable targets only for deterministic seam repairs. This specification extends that product decision; it does not reinterpret reviewed assessment scores as objective proof.

The investigation found three different saved/support counts: all six dimensions were attempted, four had usable aggregate scores, and two dimension families had supported practice workflows. No saved two-dimension aggregate was found. Seam integrity was unavailable because graph evidence was partial; navigability was unavailable because one reviewed CLI question had unclear internal readability. Those assessment limitations should remain visible and are not resolved merely by adding exercise support.

Deliver change locality as the first complete vertical slice, followed by the remaining dimension-specific completion contracts and the cross-dimension selection/rehearsal coverage. This is a specification, not authorization to change the learner's code or credit. Product implementation and release verification are separate from learner exercise completion.
