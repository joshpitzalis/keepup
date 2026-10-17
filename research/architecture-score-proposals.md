# Architecture scores for Keepup

Research proposal, 16 October 2026. No implementation or architecture refactor. Inspected checkout: `1ec9065`, branch `work/typescript-ultracite`.

## Recommendation

Use five distinct dimensions: interface leverage, change locality, seam integrity, behavioural testability, and navigability. Preserve their raw evidence rather than flattening them into one architecture grade. Start implementation with seam integrity because explicit dependency rules are the most reproducible of these measurements. Pilot the other four as reviewed assessments before automating them.

These are proposed proxies and rubrics, not validated universal architecture metrics. A numeric representation makes an assessment comparable under fixed definitions; it does not make a judgement objective.

## What the skill actually does

Read the installed Matt Pocock plugin version 1.3.1: `improve-codebase-architecture/SKILL.md`, its HTML report guidance, `codebase-design/SKILL.md`, `DEEPENING.md`, `DESIGN-IT-TWICE.md`, and the linked domain-modeling and grilling skills. This was an examination of their guidance, not execution of an architecture survey or interview.

The driver scopes exploration to the user's direction or recently changing code, reads domain vocabulary and architecture decisions, investigates friction, and presents candidate deepenings with evidence, before/after diagrams and recommendation strength. After the user chooses, it explores constraints, seams, dependencies and surviving tests. It can sharpen glossary terms and offer an ADR for a lasting rejection. Alternative-interface exploration uses contrasting designs. Report layout, interviewing and generating alternatives are process aids, not code-quality scores.

The companion vocabulary explicitly rejects implementation-lines/interface-lines as depth: padding implementation would improve it. Depth means behaviour available per amount of interface knowledge. That knowledge includes ordering constraints, invariants, error handling, configuration and performance obligations, not just public signatures.

| Guidance across the skill and its references | Evidence worth collecting | Treatment |
| --- | --- | --- |
| Hide substantial behaviour behind a small interface | Representative caller tasks; exposed operations, parameters and obligations | Interface leverage |
| Concentrate policy, bugs and verification | Independent implementations of one rule; changes needed across owners | Change locality |
| Stop tightly coupled modules leaking across seams | Private imports, forbidden dependencies, cycles, exposed infrastructure details | Seam integrity |
| Test behaviour through the intended interface | Scenario-to-test mapping, outcome assertions and controllable dependencies | Behavioural testability |
| Avoid a concept requiring navigation through many shallow modules | Fixed comprehension tasks, necessary module transitions and pass-through chains | Navigability |
| Apply the deletion test | Whether removal eliminates indirection or spreads real responsibility to callers | Diagnostic for leverage/locality/navigability |
| Avoid pure-function extraction that misses orchestration bugs | Helper tests contrasted with tests exercising the actual workflow | Testability/locality diagnostic; no blanket penalty for pure functions |
| Introduce seams where variation is real | Production/test adapters and their actual uses | Review finding; two adapters are evidence, not points to accumulate |
| Distinguish in-process, local-substitutable, owned-remote and external dependencies | Dependency classification and justified test strategy | Testability evidence and feasibility constraint |
| Accept dependencies; avoid unnecessary mutation | Construction sites, ambient dependencies and mutation visible to callers | Testability/leverage evidence; not a ban on I/O or state |
| Keep internal seams private | External imports and exports used only for internal tests | Seam integrity; private internal tests remain legitimate |
| Replace obsolete shallow tests after interface tests exist | Preserved scenario coverage and redundant assertions | Testability review; never reward fewer tests by itself |
| Prefer active, relevant work over speculative cleanup | Current mission, planned changes, recent meaningful changes | Priority, separate from health |
| Use domain language and respect ADRs | Conflicting terms, ownership mismatch, specific decision conflicts | Reviewed findings; no glossary-word-count score |
| Compare alternative interfaces and explain recommendation strength | Trade-offs, evidence, constraints, confidence | Decision quality, separate from code scores |

The driver's deletion-test wording is less precise than its companion. Use the concrete counterfactual: if removing a module merely removes indirection, it may be shallow; if it forces meaningful policy into several callers, it was providing leverage. Neither file deletion nor lower module count automatically indicates improvement.

## Five candidate scores

For every candidate, freeze module membership, representative scenarios/questions/rules, exclusions and evaluator version before comparison. Store source locations and denominators. Zero evidence is unavailable, not a perfect score. The numerical examples below are illustrative and are not measurements of this repository.

### 1. Interface leverage — depth as caller burden

**Question:** How much useful work can a caller request without managing implementation details?

Define a small representative set of behavioural scenarios, including failures. For each, inventory the operations, arguments, ordering, configuration and error obligations the caller must understand. Classify each obligation as intrinsic to the domain or imposed by the implementation.

Proposed review rubric per scenario:

- `0`: caller reconstructs the workflow or owns internal policy.
- `0.5`: module owns the workflow but callers still manage avoidable internal details.
- `1`: caller expresses intent and handles the meaningful outcome through a coherent interface.

Average these ratings over the fixed scenario set. Show operation and obligation counts alongside the grade; coarse ratings alone will miss smaller improvements. A kata can target a specific raw obligation count rather than pretending every improvement changes the coarse score.

**Example target:** preserve six scenarios while reducing caller-managed implementation obligations from eight to three.

**Evidence:** AST/type information helps inventory the surface; actual call sites, tests and semantic review determine whether obligations are avoidable. Use a reviewed model assessment, not an unreviewed model number as a pass gate.

**Failure to avoid:** a single `execute(anything)` method is not automatically deep. Nor does adding implementation complexity deepen a module. Adding real domain behaviour must not be confused with simplifying an unchanged interface.

### 2. Change locality — one policy, one owner

**Question:** Can one rule change in one place without callers reproducing the change?

For each confirmed domain rule, count independently maintained policy sites, `n`. Calls to a shared implementation do not add sites. Copying the same policy twice inside one file still gives two sites. A draft locality value is the mean of `1/n` over a fixed rule inventory; missing or unclear implementations are unavailable rather than zero sites.

**Example target:** retry eligibility is independently decided in four places; consolidate it into one owner while preserving the callers' observable behaviour.

Also retain change-scenario spread: which owners would need editing for a specific policy change? This catches orchestration scattered across modules even without textual duplication. Do not mix that number blindly into the policy-site score.

Git co-change helps discover candidates, but cannot assess immediate success. History still contains the old design after refactoring. CodeScene explicitly cautions that co-change is neither inherently good nor bad; code and its tests changing together is often appropriate. [CodeScene documentation](https://codescene.io/docs/guides/technical/change-coupling.html).

**Evidence:** semantic review establishes equivalent rules; clone detection and history locate candidates. Module ownership matters more than directory proximity. Fowler similarly recommends using actual changes to guide placement of related code. [Refactoring Module Dependencies](https://martinfowler.com/articles/refactoring-dependencies.html).

**Failure to avoid:** merging files, generalising superficially similar rules, or removing validation at separate trust boundaries just to reduce counts.

### 3. Seam integrity — honour the intended interface

**Question:** Do consumers use the intended interface without reaching into private implementation?

Declare module membership, public entry points and allowed dependency directions. Count violations with their actual import edges: private imports, forbidden dependency directions and prohibited cycles. Keep type-only and runtime dependencies distinguishable. Exposed provider-specific types or database details may require semantic review beyond import rules.

A possible display value is `1 − violating eligible edges / all eligible edges`, with no eligible edges treated as not applicable. Always retain absolute violation counts and critical findings. An exercise target should be something like `private imports: 7 → 0`; adding healthy edges must not satisfy it by diluting the fraction.

**Example target:** route seven external imports of scorer internals through the intended interface and remove one prohibited dependency cycle.

**Evidence:** AST and resolved dependency graph. Existing tools such as dependency-cruiser already support forbidden dependencies, cycles and unresolved dependency reporting; adapt their output when available. It is not currently a dependency of this repository. [Rule reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md).

**Failure to avoid:** penalising every dependency, treating useful high fan-in as bad, moving private internals behind a barrel that re-exports everything, or ignoring unresolved/dynamic imports while claiming complete coverage.

### 4. Behavioural testability — exercise real behaviour at the seam

**Question:** Can important behaviours be tested through the intended interface with controllable dependencies?

Agree on a fixed set of behaviour scenarios, including orchestration and failures. A qualifying scenario has a passing executable test through the relevant interface, asserts an observable outcome, and uses the justified dependency strategy without patching private implementation.

Draft score: qualifying scenarios / agreed scenarios. Show which scenarios fail to qualify and why. Missing tests are a known gap when the scenario inventory is agreed; incomplete test discovery or execution is unavailable evidence. The score measures these selected scenarios, not all possible behaviour.

**Example target:** five of eight scenarios currently qualify; make all eight executable through the module's interface.

Use the skill's dependency categories: direct execution for pure computation, a suitable local stand-in for local infrastructure, and justified adapters for remote dependencies. Keep real integration/contract checks where needed; passing against a fake is not proof of production compatibility. Internal seams can still have private tests.

Track setup burden, runtime and implementation-coupled assertions as diagnostics. Mutation testing can investigate assertion strength separately, on demand. Do not reward test deletion until the replacement tests protect the same behaviours. Do not equate coverage with testability.

**Failure to avoid:** creating artificial adapters just to hit a count, replacing every collaborator with a mock, or deleting difficult scenarios from the denominator.

### 5. Navigability — understand one behaviour without unnecessary jumping

**Question:** How much unrelated implementation must a maintainer inspect to answer a concrete question?

Freeze a few task-specific questions such as “where is retry identity checked?” or “what happens when a scorer fails?”. Review the minimum sufficient evidence trail. Count necessary transitions into other implementation modules, `h`, beyond the relevant owning module; record pass-through modules and ambiguous names along that trail.

A trial display score is the mean of `1/(1+h)` over the fixed questions. Keep the questions, trails and raw counts visible. This is a coarse, reviewed proxy; an agent's accidental browsing path or token count is not the measure. Missing a necessary branch must not shorten the trail and earn a higher score.

**Example target:** a representative explanation currently requires six module transitions; reduce it to two by removing unnecessary pass-throughs and bringing the concept under one owner.

**Evidence:** call/import graph plus semantic review. A fresh-context assessment can reduce memorisation bias, but evaluator variability must be reported. Preserve interface leverage and internal readability as guardrails: a giant file can reduce navigation while making understanding worse.

**Difference from locality:** navigability concerns where you must look; locality concerns where a policy change must be made. They overlap but are not interchangeable.

**Failure to avoid:** rewarding fewer files, penalising private helpers hidden behind a useful interface, or treating successful agent exploration as evidence that the learner understands the code.

## How this fits Keepup

Current code supports executable scorers producing file/metric/value JSON lines, optional raw/line/function fields, and automatically discovered map lenses. However, `scoreFiles` retains only those measurement fields, and `computeStatus` averages all metric values into file health. Module membership, evidence, confidence and score roles are not represented in the current report contract.

Architecture assessment needs to retain the actual unit: module, dependency edge, rule or scenario. Attaching the same module grade to every file would duplicate evidence and distort the line-weighted aggregate; attaching it arbitrarily to an index file would be misleading too.

Recommended sequence:

1. **Pilot a separate architecture assessment report.** Five dimensions, raw measurements, evidence, scope, unavailable results and strength of recommendation. Use the existing research/reporting approach before changing scoring semantics.
2. **Automate seam-integrity evidence first.** Reuse a resolved dependency graph and explicit project rules. Start with raw violations and documented coverage. Do not add it to the health mean by default.
3. **Extend the assessment model deliberately.** Distinguish condition scores, priority signals, readiness checks and learning evidence. Support module/relationship scope and provenance; keep cheap deterministic status separate from expensive reviewed/test-based assessments. Cached assessments must be tied to source hashes, module definitions and evaluator versions, and marked stale when any change.
4. **Introduce an architecture exercise type.** Current katas allow rename/extract/control-flow work, require comparable scores for every touched file and reject added/deleted files without comparable baselines. Architecture work needs stable logical module identities across moves, explicit allowed files/membership changes, behavioural preservation checks, and selected metric guardrails with reviewed trade-offs. That is a product change, not merely another scorer script.
5. **Calibrate before promotion to pass gates.** Try known useful and misleading refactors. Report inter-reviewer disagreement and retain evidence. A reviewed grade must not masquerade as deterministic measurement. Preserve the existing rules until the new workflow is separately specified and implemented.

Keep complexity as a local implementation signal. A deep module may contain more implementation while imposing fewer obligations on callers; its success should not require every complexity measure everywhere to fall. Conversely, better interface scores must never excuse behavioural regressions or lost validation.

The existing distinction between condition, priority and readiness in [keepup-scorer-design.md](keepup-scorer-design.md) still applies. Recent activity selects where to look; it does not establish health. Domain vocabulary and ADR conflicts guide interpretation. Actual learner answers remain the only evidence of learning.

## Validation before implementation

For each proposed scorer, establish a good example, bad example and misleading improvement. In particular: implementation padding must not improve leverage; merging files must not erase duplicate policy; adding allowed imports must not meet a zero-violation goal; deleting tests must not improve scenario protection; and a giant file must not win on navigation alone. Freeze inventories before before/after comparison and show incomplete coverage explicitly.

No new scores were run or calibrated here. No code, scoring configuration, kata target or learning events were changed. The sole addition is this research note; the existing research document remains intact.

## Local sources

- [Architecture skill](</Users/jxsh/.codex/plugins/cache/mattpocock/mattpocock-skills/1.3.1/skills/engineering/improve-codebase-architecture/SKILL.md>)
- [Design vocabulary and depth definition](</Users/jxsh/.codex/plugins/cache/mattpocock/mattpocock-skills/1.3.1/skills/engineering/codebase-design/SKILL.md>)
- [Dependency categories and testing guidance](</Users/jxsh/.codex/plugins/cache/mattpocock/mattpocock-skills/1.3.1/skills/engineering/codebase-design/DEEPENING.md>)
- [Alternative-interface exploration](</Users/jxsh/.codex/plugins/cache/mattpocock/mattpocock-skills/1.3.1/skills/engineering/codebase-design/DESIGN-IT-TWICE.md>)
- [Current scoring implementation](../keepup/scripts/keepup.ts)
- [Current kata workflow](../keepup/references/kata.md)
- [Current submit constraints](../keepup/references/submit.md)
