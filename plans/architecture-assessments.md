# Plan: Architecture assessments and exercises

> Source PRD: the approved architecture-scoring proposal and eleven-phase breakdown in this conversation, 16 October 2026; [architecture score proposals](../research/architecture-score-proposals.md). Extends the [existing Keepup PRD](../PRD.md).
>
> Status: phase granularity, blocking dependencies and testing seams approved. Planning only: this document does not authorise implementation, ticket publication, commit, push or deployment.

## Outcome

Help a learner identify, understand and improve architectural friction using five separate dimensions: interface leverage, change locality, seam integrity, behavioural testability and navigability. Show the evidence behind every assessment. Initially allow automatic architectural targets only for deterministic seam violations; reviewed dimensions inform decisions without masquerading as objective pass criteria.

Deliver useful assessment and comparison paths before introducing architecture exercises. Keep existing small katas and learner history compatible.

## User stories

These identifiers describe this extension and do not renumber the original PRD.

- **A1:** Review the implementation knowledge callers must manage to use a module for representative behaviours.
- **A2:** Inspect the scope, evidence, method, limitations and freshness behind an architecture assessment.
- **A3:** Find consumers that bypass an intended interface or violate an allowed dependency direction.
- **A4:** Understand prohibited dependency cycles across modules.
- **A5:** Identify domain rules maintained independently in several places and the owners affected by changing them.
- **A6:** See which important behaviours can be verified through the intended interface with appropriate dependencies.
- **A7:** Identify unnecessary navigation required to understand a concrete behaviour.
- **A8:** Compare architecture before and after a change without changing the question or hiding missing evidence.
- **A9:** Choose a bounded architectural improvement connected to my mission or next change.
- **A10:** Begin a learner-owned refactor against a frozen structural target and explicit guardrails.
- **A11:** Verify improvement, preserved behaviour and actual learning before recording practice.
- **A12:** Move, add or remove implementation files without losing assessment continuity or concealing regressions.

## Architectural decisions

- **Product shape:** Extend the existing local CLI, skill workflows and generated reporting. No hosted service, database, account system, background watcher or automatic code refactoring. Define architecture-specific record, inspection, analysis and comparison operations through the CLI; exact command spelling is an implementation detail. The existing map and status retain their current meaning.
- **Separate dimensions:** Architecture assessments are not ordinary file scorers and do not enter existing code-health averages, cognitive-debt formulas or historical hotspot values. Retain condition, priority, readiness and learning evidence as distinct information. Do not introduce a composite architecture grade.
- **Ownership:** The CLI validates and records evidence, supplies protected provenance, computes reproducible measurements and renders reports. Skill instructions guide reviewed assessments, opportunity selection and teaching. Agents may propose an assessment, but must label unreviewed judgements. Only learner responses and eligible learning events provide learner evidence. The learner owns all exercise code changes.
- **State and compatibility:** Use the repository's resolved existing learning-state directory, including legacy state. Preserve configuration, custom scorers, historical events, ordinary kata semantics and active exercise context. Add versioned architecture records without rewriting past evidence. Generated reports remain derived artifacts and never become learning targets. Setup and copied installation must work without depending on this development checkout.
- **Key models:** A **Module** has a stable logical identity, declared implementation membership and intended interface. A **Rule** describes a domain policy or a dependency constraint. A **Scenario** names a behaviour and its invariant. An **Assessment** evaluates a dimension for specified subjects using a fixed inventory. A **Finding** carries a concrete observation and evidence. An **Opportunity** proposes bounded work from findings. An **ArchitectureExercise** freezes a target, scope, behavioural invariants and guardrails.
- **Assessment shape:** Retain assessment identity and schema version; dimension and subject identities; method (`automated` or `reviewed`); review status and provenance where applicable; raw measurements and denominators; optional normalised value; evidence references; coverage, exclusions and limitations; and observation metadata. Distinguish measured zero, unavailable, not applicable and stale results. Recommendation strength and review confidence are qualitative judgements, not fabricated probabilities.
- **Evidence integrity:** CLI-owned provenance includes observation identity/time, source revision and exact-byte manifests. Include all source, callers, tests, module definitions, rules, inventories, analyser assets and rubric versions that materially support the claim. A changed dependency of an assessment makes its applicability stale even if its primary file is unchanged. Preserve immutable observations and reproducible retries; reject malformed input or partial writes without damaging earlier records. A repository edit never rewrites an old assessment to match new code.
- **Comparability:** Freeze the meaning of the subjects, inventories, target and evaluator before a comparison. Different revisions are expected; different definitions are not silently comparable. Historical observations may be compared against their captured source even when no longer current. Ordinary comparisons reject membership changes until explicit mapping support arrives in phase 11. Adding unrelated healthy cases cannot satisfy a raw violation target.
- **Initial score policies:** Use the draft rubrics from the source proposal, clearly labelled experimental. Interface leverage averages reviewed scenario ratings of 0, 0.5 or 1 and also shows caller-obligation counts. Locality averages `1 / independent policy sites` over confirmed rules. Testability reports qualifying scenarios over agreed scenarios. Navigability averages `1 / (1 + necessary external-module transitions)` over fixed questions. Seam integrity exposes raw violations and affected relationships; any eligible-edge percentage is display-only. Empty or unassessable denominators remain unavailable or not applicable, never perfect scores. Publish the precise rubric and its version alongside each result.
- **Reviewed evidence:** Review checks whether a proposed evidence trail is complete, whether repeated code actually represents one policy, and whether obligations belong to the domain or leak implementation. Scores may be recorded provisionally, but unknowns and disagreements remain visible. Do not claim that model agreement or a numeric rubric establishes scientific validity. Reviewed values do not automatically award practice.
- **Analysis seam:** Reuse an established dependency analyser behind a process/data contract rather than writing a language parser. Pin and fingerprint its supported configuration and version. Automated analysis initially covers JavaScript/TypeScript; supported syntax and module resolution must be explicit. Missing tools, unsupported syntax, unresolved imports and dynamic dependencies produce bounded, visible limitations. Package required assets or document and verify an explicit prerequisite; never rely on packages present only in this checkout or silently install tools during status.
- **Testability meaning:** A qualifying scenario has an executable test through the intended interface, an observable-outcome assertion and a justified dependency strategy. Pure computation, local substitutes, owned remote adapters and true external adapters need different treatment. Preserve necessary integration and contract checks. An accepted scenario with no test is a known gap; incomplete discovery or execution is unavailable evidence. Assessment may identify test-preparation work, but agents do not author tests to make a learner's kata pass.
- **Reporting:** Provide consistent machine-readable and human-readable evidence plus a generated HTML view. Make raw counts, denominators, methods and limitations visible; module grades must not be duplicated onto every constituent file. Reading stored results does not rerun expensive analysis or tests. Essential report content remains readable without external scripts; browser opening failures return the artifact path. Escape source-derived content and provide keyboard-accessible inspection.
- **Exercise contract:** Architecture exercises are a distinct opt-in workflow; existing small-kata rules stay intact. Initially target a measured raw seam violation on existing files. Freeze selected structural guardrails and all relevant behavioural checks, rather than imposing universal improvement across every architecture rating. Any anticipated structural trade-off must be named before starting; test failures, removed validation and unresolved correctness regressions cannot be excused by a better score. Rules, exceptions and denominators cannot change during the exercise to remove a failing target.
- **Learning contract:** Preserve pre-quiz, post-quiz, explain-back, attribution and delayed-check discipline. Presenting a report, proposing work, inspecting source or recording a reviewed assessment never proves learner understanding. A successful exercise requires actual learner evidence; delayed verification remains separate from immediate practice. Only the supported CLI event writer records learning events.
- **Testing seams:** Prefer public CLI execution against real temporary Git repositories, with controlled dependency-analyser outputs for failures and coverage cases. Also exercise the actual supported analyser against small source fixtures to verify graph correctness. Check generated reports through focused browser scenarios. Include copied-skill installation checks, legacy-state compatibility and ordinary-kata regressions in the slices that affect them. Keep tests at these seams rather than coupling them to private helpers.
- **Calibration:** Each dimension ships with a useful improvement, a non-improvement and a misleading apparent improvement. Validate raw evidence and observable outcomes, not just an expected score literal. Keep rubric versions fixed for before/after comparisons and expose reviewer disagreement. Initial acceptance proves the specified measurement works, not universal architectural quality.
- **Related work:** [Hotspot prioritisation and nesting](hotspot-prioritisation-and-nesting.md) is a separate plan. Architecture selection can consume its results if available, but neither plan blocks this one. Reuse any shared provenance or packaging support that has landed, without changing either plan's semantics. Do not duplicate its activity calculation or implement another ranking engine here. Coordinate shared CLI, event and teaching changes when implementation begins.
- **Non-goals:** Fully automatic semantic depth judgement; implementation-lines/interface-lines ratios; an architecture score leaderboard; automatic pass gates based only on reviewed ratings; full multi-language dependency analysis; automated mutation testing; new historical hotspot analysis; automatic ADR/glossary editing; and agent-written learner refactors. All five reviewed/automated dimensions remain in scope as described above.

## Phase graph and delivery rules

Phase 1 unlocks phases 2, 4, 5, 6 and 7 independently. Phase 2 unlocks phase 3. Phase 7 unlocks phase 8. Phases 2 and 7 together unlock phase 9, followed by phase 10 and then phase 11.

There is no standalone prefactoring phase: make only the restructuring necessary to deliver the next working slice. Every phase includes the relevant CLI behaviour, durable state, skill guidance, report changes and tests. A phase is complete only when its path works from a copied installation, with documentation of its actual limits. Calibration belongs with each dimension rather than in a final catch-all phase.

---

## Phase 1: Record and display an interface-leverage assessment

**User stories**: A1, A2.

**Blocked by**: None — can start immediately.

### What to build

Declare a logical module and representative caller scenarios, record a reviewed inventory of caller obligations and scenario ratings, then inspect the resulting assessment as structured output and a readable report. Establish the common assessment format through this complete use case, with source evidence and freshness checks from the start.

### Acceptance criteria

- [ ] A user can declare a module's identity, members and intended interface, then record scenarios with operations, arguments, ordering, configuration and error obligations tied to concrete evidence.
- [ ] The assessment distinguishes intrinsic domain obligations from proposed avoidable implementation obligations, and reviewed findings from unreviewed suggestions.
- [ ] Scenario ratings and raw obligation counts are shown together; missing scenarios, unclear evidence and zero denominators produce explicit limitations rather than healthy defaults.
- [ ] Recording and inspecting the assessment through the CLI produces the same facts in structured output and the generated report. A report can be reopened without rerunning an evaluator.
- [ ] Source and definition fingerprints cover the evidence used. Changing a supporting caller or rubric marks the stored result stale without altering its original evidence.
- [ ] Invalid records, identical retries, conflicting retries, concurrent writes and interrupted writes have explicit integrity-preserving behaviour verified through the CLI.
- [ ] Assessment recording leaves ordinary health, mind, delayed checks and active katas unchanged; existing and legacy learning state remain usable.
- [ ] Calibration demonstrates that reducing avoidable caller obligations helps, implementation padding does not help, and a single untyped catch-all operation is not automatically rated deep.
- [ ] Copied-install and browser checks cover a populated report, unavailable evidence, source text requiring escaping, keyboard inspection and an automatic-open failure. Usage guidance describes the reviewed nature of this assessment.

---

## Phase 2: Detect forbidden dependencies

**User stories**: A3, A2.

**Blocked by**: Phase 1.

### What to build

Analyse the declared JavaScript/TypeScript module interfaces and permitted dependency directions. Record private imports and prohibited directions as automated seam-integrity findings, then display each edge, source location, violated rule and analysis coverage in the same assessment/report path.

### Acceptance criteria

- [ ] Explicit membership, public entry points and dependency rules determine findings; mere dependency count or high fan-in is not itself a violation.
- [ ] Real-analyser fixtures demonstrate both a private import violation and a permitted public import, with correct source, destination and rule identity.
- [ ] Public re-exports and configured resolution behaviour are handled according to documented rules; moving a private import behind an indiscriminate re-export must not silently count as a repaired intended interface.
- [ ] Runtime, type-only, external and unresolved dependencies remain distinguishable. Unsupported or opaque dynamic dependencies produce explicit partial coverage rather than a complete healthy result.
- [ ] Analyser absence, failure, malformed output, timeout and version/configuration changes preserve earlier results and produce honest unavailable or stale assessments.
- [ ] Reports expose absolute violation counts, eligible edges and locations. Adding unrelated permitted edges cannot satisfy a raw violation-reduction target.
- [ ] Graph acquisition, rule evaluation, stored findings and displayed results are reproducible for the captured source and definitions. A source change during analysis cannot create a mixed observation.
- [ ] Copied installation works with the documented analyser delivery/prerequisite strategy, independent of the development checkout. Document supported syntax, resolution, exclusions and invocation costs.

---

## Phase 3: Detect prohibited dependency cycles

**User stories**: A4, A2.

**Blocked by**: Phase 2.

### What to build

Extend automated seam assessment with prohibited cycles across logical modules. Show an understandable cycle path and the policy that makes it a violation, retaining runtime/type distinctions and permitted exceptions.

### Acceptance criteria

- [ ] A real fixture with a prohibited module cycle reports a complete explanatory path; an acyclic equivalent and an explicitly permitted relationship do not report the same violation.
- [ ] Define a deterministic counting unit for cyclic groups so equivalent graph traversals do not inflate the target; retain representative paths for explanation.
- [ ] Type-only cycles and runtime cycles follow declared policy rather than an implicit blanket rule. Internal dependencies are not misreported as cross-module cycles.
- [ ] Exceptions remain visible and fingerprinted; changing an exception or module definition invalidates comparison rather than improving the old score.
- [ ] Removing a relevant edge removes the cycle finding; adding harmless edges or changing file order does not conceal it.
- [ ] Graph incompleteness prevents an unqualified claim of cycle freedom. Reports preserve valid findings while showing unknown coverage.
- [ ] CLI and report checks exercise overlapping cycles, permitted cycles, partial graphs and a repaired cycle. Installed usage documentation explains the count and its limitations.

---

## Phase 4: Assess change locality

**User stories**: A5, A2.

**Blocked by**: Phase 1.

### What to build

Record a reviewed inventory of domain rules, independently maintained policy sites and the owners affected by representative policy changes. Show locality scores and evidence, keeping historical co-change or syntactic similarity as optional investigation inputs rather than proof.

### Acceptance criteria

- [ ] Each confirmed rule has a stable identity, evidence-backed policy sites and an explanation of why those sites implement the same policy.
- [ ] Calls to one implementation do not inflate independent-site counts, while two independent copies in the same file still count separately.
- [ ] Unclear equivalence, absent implementations and missing evidence do not create zero-site or perfect-score results. Raw counts and the confirmed inventory accompany any aggregate.
- [ ] Representative change scenarios show affected owners separately from the policy-site score; the interface does not imply that Git co-change measures immediate refactoring success.
- [ ] Calibration recognises genuine consolidation, rejects mere file merging, and preserves deliberately repeated validation at distinct trust boundaries.
- [ ] An agent proposal can be inspected and reviewed with evidence before becoming an accepted assessment; disagreements and exclusions remain visible.
- [ ] The complete recording, persistence and reporting path works through the CLI and copied installation without requiring phases 2 or 3. Usage guidance explains semantic review responsibilities.

---

## Phase 5: Assess behavioural testability

**User stories**: A6, A2.

**Blocked by**: Phase 1.

### What to build

Connect a fixed inventory of meaningful scenarios to existing executable tests, observable assertions and justified dependency strategies. Record the evidence needed to determine which scenarios qualify, and report gaps without changing tests or treating all test execution as architectural evidence.

### Acceptance criteria

- [ ] Scenarios include behaviour and failure invariants, intended test interface and references to existing tests; a whole-suite pass alone does not prove that every mapped scenario is covered.
- [ ] A qualifying scenario has successful execution evidence and reviewed outcome assertions through the intended interface. Tests that only inspect helper internals do not automatically qualify orchestration scenarios.
- [ ] An agreed scenario without a test is a known gap. Failed execution, skipped relevant tests, missing tools and incomplete discovery are distinguished and cannot earn passing credit.
- [ ] Dependency strategy accounts for pure computation, local substitutes, owned remote dependencies and true external dependencies. Necessary production compatibility checks remain explicit.
- [ ] Test and dependency evidence is tied to the assessed source and command/environment requirements; changes make the result stale. Reading the assessment never reruns tests.
- [ ] Reports show qualifying and total scenarios, reasons for gaps and available setup/runtime diagnostics without claiming overall correctness or safety percentages.
- [ ] Calibration rejects deleting hard scenarios, replacing all outcomes with mock-interaction assertions and deleting tests as ways to improve the score.
- [ ] CLI fixtures cover qualifying, missing, failed and unavailable scenarios. A workflow rehearsal uses existing tests and identifies separate test-preparation work without writing tests for the learner.

---

## Phase 6: Assess navigability

**User stories**: A7, A2.

**Blocked by**: Phase 1.

### What to build

Record fixed questions about behaviour and reviewed evidence trails sufficient to answer them. Show necessary transitions outside the owning module, ambiguous naming and unnecessary pass-throughs, while keeping internal readability and interface leverage visible as interpretation constraints.

### Acceptance criteria

- [ ] Each assessment retains the exact comprehension question, owning module, evidence trail and why each external implementation transition is necessary.
- [ ] Counts derive from the reviewed sufficient trail, not an agent's accidental browsing sequence, token usage or elapsed time.
- [ ] An incomplete trail, unresolved branch or ambiguous ownership produces an explicit limitation rather than a smaller count and higher score.
- [ ] Raw transitions and per-question values are visible alongside any aggregate; zero questions remain unavailable.
- [ ] Calibration recognises removed pass-throughs, does not penalise private helpers callers need not inspect, and flags a giant-file consolidation that merely hides the navigation problem.
- [ ] Reviewer disagreement and domain naming issues remain inspectable. Assessment results do not modify learner understanding or grant quiz credit.
- [ ] CLI and report checks cover complete and incomplete trails, shared evidence and updated source. Guidance distinguishes navigability from change locality.

---

## Phase 7: Compare architecture assessments

**User stories**: A8, A2.

**Blocked by**: Phase 1.

### What to build

Select captured before/after observations and produce an evidence-backed comparison. Compare raw measurements and any compatible normalised values without requiring every dimension to exist. Other dimensions adopt the same comparison path when they land.

### Acceptance criteria

- [ ] A leverage-only comparison works before other dimensions exist; later dimensions can be compared independently using the same subject/provenance model.
- [ ] Equivalent subjects, inventories and evaluator definitions permit comparison across changed source revisions. A stale observation can serve as a historical baseline but cannot be presented as current evidence.
- [ ] Changed questions, rules, exceptions, scenario denominators, module membership or evaluator versions are identified as incomparable with a reason; missing dimensions are not zero or unchanged.
- [ ] Before/after reports show raw measurements, denominator changes, locations and relevant limitations. An unrelated aggregate improvement cannot hide a surviving critical finding.
- [ ] An assessment created while source or definitions change is rejected or marked incomplete, never accepted as a stable comparison point.
- [ ] Calibration covers a real improvement, an unchanged result, a regression, changed definitions and a diluted percentage with unchanged raw violations.
- [ ] Structured output and rendered comparison agree. CLI and browser checks verify historical/current labels and safe evidence navigation; no ordinary health or learner-history semantics change.

---

## Phase 8: Recommend bounded improvements

**User stories**: A9, A2.

**Blocked by**: Phase 7.

### What to build

Use available architecture findings and explicit mission or next-change context to offer a bounded opportunity. Explain why the work matters, what would change, its behavioural risks and its recommendation strength. Missing analysis dimensions remain visible, and assessment work can be offered when a refactor is not ready.

### Acceptance criteria

- [ ] An opportunity names the behaviour, affected modules, evidence, intended outcome, proposed raw target, allowed scope, verification approach and a stop condition.
- [ ] Mission or planned-change relevance is grounded in supplied context; do not invent future work, incidents or learner gaps to justify a recommendation.
- [ ] Strong, worth-exploring and speculative recommendations have stated evidence and limitations. A report may recommend no refactor when evidence or payoff is insufficient.
- [ ] Domain glossary and ADR context inform interpretation when present. Conflicts are identified without automatically changing glossary entries or decisions.
- [ ] Incomplete dimensions, stale evidence, inadequate tests or uncertain scope lead to an explicit assessment/preparation activity or a deferred refactor, not an automatic exercise start.
- [ ] Available hotspot results may inform priority, but their absence does not block this phase and activity never becomes an architectural target.
- [ ] Guidance labels executable architecture exercises unavailable until that workflow lands; a recommendation alone grants no exposure, practice or understanding.
- [ ] Rehearsals cover a mission-relevant candidate, a speculative candidate, an ADR conflict, insufficient evidence and no useful work. CLI/report output retains the opportunity's evidence and explanation.

---

## Phase 9: Start an architecture exercise

**User stories**: A10, A2.

**Blocked by**: Phases 2 and 7.

### What to build

Start a distinct, bounded seam-repair exercise on existing files. Link the chosen raw violation target to a stable assessment, collect the learner's pre-quiz, recheck cleanliness and freeze the source scope, definitions, behavioural invariants and selected guardrails before presenting the task.

### Acceptance criteria

- [ ] A user can start directly from a current deterministic dependency finding without needing opportunity selection or the other reviewed dimensions.
- [ ] The exercise has a raw baseline, strictly improving attainable goal, declared files/modules, existing test command, relevant behavioural invariants and explicit selected structural guardrails.
- [ ] Dirty target files, conflicting active exercises, unavailable tests, stale/incomplete target analysis and changed definitions prevent a start while preserving evidence and code.
- [ ] Actual pre-quiz answers and concepts are linked to the exercise. The post-answer commit/content recheck prevents starting against a different source state.
- [ ] Baselines capture the complete relevant source and definition manifests, not only the file containing the reported violation. Retries cannot create duplicate exercises or replace the original baseline.
- [ ] Ordinary small katas remain readable and behave unchanged. Initial architecture exercises disallow file additions/deletions/membership changes with a clear message until phase 11.
- [ ] The task card explains the technique, target, callers, tests, invariants and stop condition. The learner owns edits; task presentation and acknowledgement remain separate from correctness evidence.
- [ ] Lifecycle states include explicit abandonment and a provisional submission-pending state until phase 10 ships; do not promise assessment or practice that is not implemented.
- [ ] CLI tests and a teaching rehearsal cover a valid start, retries, active-kata conflict, changes during the quiz and invalid baselines from a copied installation.

---

## Phase 10: Submit and assess an architecture exercise

**User stories**: A11, A8.

**Blocked by**: Phase 9.

### What to build

Assess a learner's existing-file architecture refactor against the stored baseline. Verify behaviour, the raw target, selected structural guardrails, stable evidence and attribution; then collect the post-quiz and explain-back before recording practice. Preserve failed attempts for further work and allow explicit abandonment.

### Acceptance criteria

- [ ] Submission recovers the original exercise context and detects every relevant touched file, unexpected commit, changed definition and out-of-scope edit; unresolved attribution prevents a pass without reverting edits.
- [ ] The complete agreed test command must pass. Timeouts, signals, skipped required checks, missing dependencies and incomplete runs cannot be substituted with a successful trivial command.
- [ ] The same raw target must improve and reach its goal under compatible rules and complete target-relevant coverage. Adding permitted edges or removing a rule cannot satisfy it.
- [ ] Selected structural guardrails are evaluated individually across the relevant callers and modules. Unselected reviewed-score movement is reported, but cannot silently excuse a failing agreed guardrail or behavioural regression.
- [ ] Source, tests, inventories and evaluator definitions are stable across testing, analysis and the pass record. Changes invalidate the attempted assessment rather than replacing its baseline.
- [ ] After objective checks pass, ask different questions on the pre-quiz concepts and collect the learner's own explain-back. Do not manufacture answers or infer understanding from the successful refactor.
- [ ] Only accepted pass evidence grants practice and closes the exercise. A failed assessment stays active, explicit abandonment closes without practice, and delayed verification remains a separate later check.
- [ ] CLI acceptance paths cover pass, fail, retry, abandonment, stale evidence and concurrent edits; teaching rehearsals verify actual question/answer and explain-back handling. Existing small-kata and legacy-history regressions remain green.
- [ ] Documentation distinguishes automatic seam checks, reviewed judgements, behavioural validation, practice and delayed retention evidence.

---

## Phase 11: Support exercises that reshape modules

**User stories**: A12, A8, A10, A11.

**Blocked by**: Phase 10.

### What to build

Extend the complete architecture-exercise workflow to declared file moves, additions and removals, with explicit module identity/membership mappings. Preserve the behaviour and rule being assessed across the transformation, including all callers and newly created implementation, without treating a missing file as a successful repair.

### Acceptance criteria

- [ ] Start can declare a bounded planned transformation, allowed new paths and before/after module mappings while preserving clean existing targets and the original source inventory.
- [ ] Stable logical identities support ordinary file moves; module splits/merges require an explicit reviewed mapping that retains the original behaviour and policy obligations. The mapping cannot silently redefine or remove the target rule.
- [ ] Submission inventories and scores all affected old/new members and callers. New files are visible in working-tree assessment before commit, while exercise completion follows documented tracking/snapshot requirements. Unsupported paths and unexpected additions remain assessment gaps.
- [ ] A removed implementation is checked through its replacement and callers; deleted guards, vanished tests, unresolved imports and source moved outside scope cannot erase violations or produce a false pass.
- [ ] Rule/scenario inventories and evaluator definitions remain fixed. Planned membership changes use the declared mapping; undeclared transformations require a new agreed exercise context rather than a rewritten baseline.
- [ ] All relevant new and changed bytes receive stable provenance. Historical file evidence remains historical; moving files or merging modules does not automatically transfer verified learner understanding to new code.
- [ ] Practice is associated only with attributable learner work and actual linked evidence. Quiz concepts can be followed through the declared transformation without fabricating answers or exposure for untouched code.
- [ ] Real temporary-repository tests cover a rename, a new internal implementation, consolidation with deletion, a declared split/merge mapping, out-of-scope movement and a concurrent change during assessment.
- [ ] Copied-install and teaching rehearsals demonstrate a full reshaping exercise through submission, and confirm that ordinary katas retain their stricter existing-file rules. Reviewed architecture scores remain advisory rather than new automatic pass gates.

## Handoff

Each phase maps one-to-one to a future ticket; its **Blocked by** line supplies the dependency edges. Implementation should begin only after separate authorisation. Do not change the learner's currently active kata, install new scoring definitions into its state or publish tickets as a side effect of this planning task.
