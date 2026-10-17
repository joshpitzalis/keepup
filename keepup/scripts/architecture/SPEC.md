# Architecture assessments and exercises

## Problem

File health cannot describe architectural friction or prove learner understanding.
Learners need bounded practice across five architectural dimensions, with source-backed
judgments distinguished from automated measurements and actual learning evidence.

## Solution

Versioned local observations preserve raw inventories, source/tool snapshots, coverage,
reviewer judgments and unavailable values. Historical evidence never changes meaning.
The parent `code-health.ts` combines current dimensions only for its advisory summary;
exercise completion uses the selected dimension's frozen contract, never an aggregate.
State resolves through the existing `.keepup` or legacy `.cogdebt` directory.

### How the files fit

- `commands.ts` routes explicit CLI operations; inspection does not rerun evaluators.
- `domain.ts`, `parse.ts` and focused parsers reconstruct trusted domain records from JSON.
- `storage.ts` captures exact source/evaluator/tool bytes, publishes immutable observations,
  validates archives and reports conservative freshness without rewriting history.
- `report.ts` renders matching text/JSON and offline, escaped, keyboard-accessible HTML.
- `seam-domain.ts`, `seam-parse.ts` and `seams.ts` evaluate declared module/interface policies.
- `analyser.ts` and its config own pinned dependency-cruiser/compiler acquisition and limits.
- `cycles.ts` counts prohibited SCCs under frozen runtime/type policies and exceptions.
- `locality.ts` distinguishes independent equivalent policy sites, shared calls and owners;
  repeated necessary trust-boundary validation is never a count-reduction shortcut.
- `testability.ts` and `testability-run.ts` retain fixed scenarios, actual selected Node
  execution, reviewed observable assertions and required dependency compatibility.
- `navigability.ts` measures sufficient implementation trails for exact questions, with
  explicit ownership, coherent readability and unresolved/disputed evidence.
- Versioned rubric files explain reviewed calibration; ratings alone grant no learning.
- `comparison.ts` freezes subjects, inventories, rules and methods; changed definitions
  become incomparable and missing evidence never becomes zero improvement.
- `opportunities.ts` and its parser capture mission-relevant bounded recommendations;
  current applicability rechecks source, definitions and supporting tools independently.
- `exercise-capabilities.ts` owns installed support for six families, separately from
  assessment attempts, measured dimensions and the preparation of a particular target.

### Frozen exercise lifecycle

- `exercise-domain.ts` and `exercise-parse.ts` define additive target/preparation contracts.
- `exercises.ts` coordinates preparation, actual linked pre-quiz, unchanged-source start,
  assessment, explicit abandonment and completion under the existing shared writer lock.
- `exercise-evidence.ts` captures source/untracked paths, index modes, HEAD, host assets,
  environment and definitions; changes during tests or learning invalidate the attempt.
- `exercise-tests.ts` runs the entire unchanged explicit Node TAP suite plus exact named
  witnesses; empty, failed, skipped, cancelled or pending execution never qualifies.
- `exercise-reviewed.ts` binds locality policy/site/validation review to real source and
  callers; `exercise-interface.ts` freezes avoidable caller obligations and domain choices.
- `exercise-navigation.ts` freezes questions, owners and original trail evidence; fewer
  necessary transitions require reviewed readability and unchanged external callers.
- `exercise-testability.ts` freezes an unsupported scenario and separate learner-authored
  positive/negative/compatibility execution while preserving original regression bytes.
- `exercise-graph-guardrails.ts` captures complete source-matched supporting graph policies,
  reruns their raw guards on the candidate and checks analyser assets through final credit.
- `exercise-candidate.ts` checks scope, unchanged tests, modes, linear learner commits and
  attribution. `exercise-reshape-candidate.ts` permits only explicitly mapped new/moved paths.
- `exercise-transformation.ts` and its parser preserve original logical/public roles and
  actual concept mappings; new paths require tracking and their own mapped learning.
- `exercise-submit.ts` and its parser preserve immutable failed/accepted attempts, require
  actual different post questions, explain-back and invariant review, then call the
  existing internal writer once for eligible changed files with actual learning evidence.
- `exercise-storage.ts` checks immutable context/attempt/acceptance records; retry identity
  and owner checks preserve abandoned work and recover interrupted acceptance safely.
- `exercise-comparison.ts` exposes captured target/guard evidence; `exercise-advisory.ts`
  reports other dimensions without automatic semantic re-rating.

## Limits and invariants

Partial graphs never prove seam safety. Seam targets repair whole frozen rules or cycles
intersecting original subjects, so rerouting, re-exports and SCC expansion cannot erase them.
Reviewed locality/interface/navigation scope uses existing files; testability supports
explicitly mapped learner test work. Reviewed transformations plus graph guards require
separate preparation and remain unsupported. Cross-role single-file collapse is unsupported.
The current behavioural runner accepts explicit tracked Node TAP files, with bounded runs.
Source excerpts bind review to bytes but cannot prove honest semantic judgment. Agents never
write learner refactors, tests, quiz answers or explain-backs. Recommendations, reports and
preparation grant no practice. Immediate practice never grants delayed retention verification.
