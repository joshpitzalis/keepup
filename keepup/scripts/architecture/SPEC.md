# Architecture assessments

## Problem

A file health score cannot show which implementation knowledge callers must manage.
Learners need inspectable evidence for a logical module, with reviewed judgements
kept separate from learning events and automatic file scores.

## Solution

The CLI records a fixed scenario inventory and module definition as an immutable,
versioned observation. It computes the experimental interface-leverage average and
shows raw domain/avoidable obligations, review provenance and missing evidence.

Exact-byte snapshots capture all tracked repository files outside learning state,
plus evaluator assets. This deliberately conservative inventory prevents omitted
callers and tests from silently remaining fresh. Any tracked-file addition/removal,
byte change, or changed rubric/evaluator asset makes the observation stale.
Historical snapshots remain intact; inspections never evaluate code or run tests.

### How the files fit

- `commands.ts` connects architecture operations to the existing CLI.
- `domain.ts` names the input, observation, measurements and inspection contracts.
- `parse.ts` reconstructs accepted JSON at the trust boundary.
- `storage.ts` captures evidence, publishes complete observations, checks retries and freshness.
- `report.ts` presents the same facts as text and script-free accessible HTML.
- Reports expose declared evidence and the versioned rubric from archived snapshots;
  native details keep historical source inspectable by keyboard without executing it.
- `interface-leverage-rubric.md` publishes the fingerprinted experimental judgement rules.

## No-gos & known complexities

- No composite architecture grade and no changes to ordinary kata/event histories.
- Scores depend on reviewer rationale; the CLI cannot prove semantic depth.
- Atomic hard-link publication makes identical concurrent retries converge; conflicting
  input fails. Unpublished temporary files and orphan snapshots remain harmless.
- All evidence references must name tracked regular files. Incomplete scenario evidence
  yields unavailable results, never a healthy default.
- Capture/inspection costs scale with tracked repository bytes. Untracked material
  cannot support a claim until explicitly tracked. Automated JS/TS seam analysis runs only on explicit `analyse` requests.

## Automated seam integrity

`seam-domain.ts` names explicit modules, dependency policies, raw graph evidence and
findings. `seam-parse.ts` reconstructs definitions; shared JSON fields live in
`parse-common.ts`. `analyser.ts` owns the pinned dependency-cruiser process and
compiler AST coverage/locations; `dependency-cruiser.json` fixes supported resolution.
`seams.ts` evaluates public-only/forbidden policies without parsing a language.
Graph metadata can only enter through the CLI-owned evaluator inside source capture.
Tool assets and transitive resolver implementation are snapshotted and checked for
freshness without executing analysis during reads. Raw violations remain distinct
from eligible-edge denominators; unavailable/partial coverage never reports healthy.


`comparison.ts` compares captured observations without evaluating code. It freezes
module/interface/membership, representative inventory, exclusions and evaluator
assets; returns explicit incompatibility and null deltas for unavailable evidence.
Both sides retain raw facts, limitations, provenance and separate freshness labels.
`compare` and `compare-report` expose the same facts through CLI and escaped HTML.
Change locality extends the same record path with a fixed confirmed domain-rule inventory.
`locality.ts` counts independent evidence-backed policy sites, excluding calls to shared
implementations; ownership scenarios remain separate. Missing sites/evidence stay unavailable.
`change-locality-rubric.md` publishes the fingerprinted experimental rule and trust-boundary
caution. Proposed/unclear equivalence, disagreements and exclusions remain visible. Consolidation
can improve locality; file merging cannot. Necessary repeated trust-boundary validation remains.

`cycles.ts` collapses the acquired graph to declared logical modules, selects the
explicit runtime/type policy and counts one prohibited strongly connected group.
Deterministic closed evidence walks cover every member with actual file edges;
exact group exceptions remain visible without removing edges. Optional cycle
input/analysis/measurements preserve pre-cycle seam record canonical bytes when
omitted. The comparator freezes cycle policy/exceptions and exposes raw group deltas.
Partial graphs never establish cycle freedom. Repeated reachability intentionally
serves small local module inventories.

Behavioural testability uses `testability.ts` for reviewed fixed scenarios and qualification,
and `testability-run.ts` to execute existing exact top-level Node test cases inside the
source-capture boundary. Protected execution results retain command/output/environment;
inspection never reruns. Gaps, failures, skips and unavailable discovery stay distinct.
Production compatibility checks remain necessary for owned/true external dependencies.
The versioned testability rubric grants no learner evidence or overall correctness claim.

Navigability uses `navigability.ts` for reviewed sufficient comprehension trails and raw
implementation-module transitions, plus `navigability-parse.ts` for its input boundary.
`navigability-rubric.md` fixes the experimental count. Incomplete/ambiguous trails and
obscured readability stay unavailable; private helpers and accidental browsing do not
inflate counts. Questions/owners freeze comparisons; naming disagreements stay visible.
