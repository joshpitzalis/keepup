# Full initial assessment

Init owns this workflow. Run it after CLI setup, without an onboarding interview.
Give progress updates while inspecting source and running tools. Keep all generated
plans/reports in the returned state directory. The source and learner's edits stay intact.

## Discover and freeze the assessment scope

1. Run `status --json` to get scoped files, raw file metrics, scorer warnings and
   existing understanding evidence. Its summary is file health, not overall architecture.
2. Read the mission, repository navigation, manifests, tests and implementation.
   Map every scoped code file to its actual logical module and public entry points.
   Keep the mapping and explicit non-code/generated/vendor exclusions in
   `<state>/initial-assessment.md`; explain unsupported languages. Cover the whole
   included codebase, not just high-debt files or a convenient demonstration module.
3. From actual public workflows, define fixed representative interface scenarios,
   policy rules/change examples, comprehension questions and behavioural scenarios
   for each module. Inspect every public operation and policy path before deciding
   which scenarios represent it. Retain gaps, counterexamples and evidence locations.
   These are evaluator questions, not questions presented to the learner.
   Agent semantic judgments start as provisional, with provenance and rationale.

## Execute all six dimensions

Use [the architecture schemas and rubric links](architecture.md); keep raw input
JSON under the state directory and pass it to the documented CLI commands.

| Dimension | Required work |
| --- | --- |
| File health | Run installed scorers through `status --json`; preserve raw metrics and scored-line coverage. |
| Interface leverage | Record one assessment per module with concrete scenario ratings, caller obligations and source evidence. |
| Boundaries and cycles | Declare the actual module map, public-only/forbidden dependency rules and runtime cycle policy, including justified exact exceptions. Run `architecture analyse` with the pinned analyser. |
| Change locality | Trace confirmed policy rules to independent implementation sites and representative affected owners; retain necessary trust-boundary validation. Record each module. |
| Navigability | Trace fixed exact questions through the necessary implementation-module transitions, reviewing internal readability and ambiguity. Record each module. |
| Behavioural testability | Identify existing outcome tests and required compatibility checks for the fixed scenarios. Run `architecture testability`; missing tests stay gaps. |

Use the installed prerequisite from `KEEPUP_ANALYSER_DIRECTORY`, or discover its
documented configured location. Missing tools are an explicit blocked attempt;
request their installation when necessary rather than silently omitting a dimension.
Never replace real analysis or test execution with supplied success metadata.
Unsupported test runners remain unavailable; retain the existing suite's actual
result separately when useful. Do not author tests, alter code, invent domain
equivalence or mark an uninspected scenario complete to manufacture a score.

Record unavailable reviewed inputs with null ratings/incomplete trails when the
schema permits. Record each blocked attempt and its reason in the scope document.
All six dimensions must be attempted; unavailable evidence does not count as a pass.

## Combine and report

Collect exactly the assessments from this run. Select one record per module per
reviewed dimension and one dependency-graph record. Run:

```sh
node <CLI> health '["actual-interface-id","actual-seam-id","actual-locality-id","actual-navigation-id","actual-testability-id"]'
```

Include all module assessment IDs, not just one per dimension. The CLI checks
stored evidence and freshness, saves the selected plan and a report, and computes
the equal-weight mean of the available six dimension scores. Multiple modules
average within their dimension; missing module measurements make that dimension
unavailable. Empty, stale, partial-graph or unexecuted results cannot score perfectly.

The experimental boundary score is the mean of `1/(1+boundary findings)` and
`1/(1+prohibited cyclic groups)`; show raw counts in the report. Both graph acquisition
and the cycle policy are required. The other four architecture dimensions retain
their existing rubric values. These are advisory design measures, not proof of correctness.

Inspect the result's missing-source membership, measured-dimension count, file
coverage, warnings and provisional judgments. Repair omissions before finishing;
genuine unsupported evidence remains explicit. Save unresolved limitations in the
scope document. If source changes during the assessment, refresh affected observations
and rerun aggregation; historical observations remain untouched.

Finish with the two headline scores and the first-quiz invitation from the parent
skill. A partial/advisory qualifier must remain when evidence warrants it. Never
present a one-dimension complexity result as a completed full assessment.
