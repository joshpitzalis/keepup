# Reviewed architecture assessments

Run `node <skill>/scripts/keepup.mjs init` in the learner's repository first.
Architecture lives in the returned learning-state directory, including legacy `.cogdebt`.
It never changes health, mind, delayed checks, ordinary katas or learning events.

Record a reviewed module and a fixed representative caller inventory:

```sh
node <skill>/scripts/keepup.mjs architecture record '<json>'
node <skill>/scripts/keepup.mjs architecture inspect baseline --json
node <skill>/scripts/keepup.mjs architecture inspect baseline
node <skill>/scripts/keepup.mjs architecture report baseline
node <skill>/scripts/keepup.mjs architecture list
```

`report baseline --no-open` only generates HTML. Failed automatic opening returns the
artifact path and warning. Reopen that file without reevaluation; regenerating updates
the freshness display. HTML works offline with JavaScript disabled and keyboard-native
expandable provenance. All source-derived text is escaped.

Minimal JSON (`module.ts` and `caller.ts` must be tracked regular source files):

```json
{
  "id": "baseline",
  "dimension": "interface-leverage",
  "module": {"id": "orders", "members": ["module.ts"], "interface": ["module.ts"]},
  "scenarios": [{
    "id": "save-order", "description": "Save a valid order", "rating": 0.5,
    "rationale": "Module owns saving; callers still configure internal retry policy",
    "evidence": ["caller.ts"],
    "obligations": [{"kind": "configuration", "classification": "avoidable",
      "description": "Select internal retry settings", "evidence": ["caller.ts"]}]
  }],
  "review": {"status": "reviewed", "reviewer": "Learner", "confidence": "medium",
    "notes": "Checked representative callers and meaningful outcomes"},
  "evidence": [], "exclusions": [], "limitations": []
}
```

Declare identity, implementation membership and intended interface in `module`.
`scenarios` freezes the inventory. Give each a stable identity, concrete behaviour,
reviewer rationale and evidence paths. Obligations use `operations`, `arguments`,
`ordering`, `configuration` or `errors`; classify each as intrinsic `domain` or
proposed avoidable implementation knowledge (`avoidable`). Separate incomplete,
unreviewed suggestions with `review.status: provisional`; confidence is qualitative.

The [experimental v1 rubric](../scripts/architecture/interface-leverage-rubric.md)
assigns 0 when callers reconstruct workflows/internal policy, 0.5 when workflow belongs
to the module but avoidable details leak, and 1 when callers express intent and handle
a meaningful outcome. Average over the fixed inventory and show obligation counts.
Use `rating: null` for unknowns. Missing evidence or any missing rating makes the
aggregate unavailable. Empty inventories never score perfectly. Provisional values
remain labelled; numeric agreement does not prove scientific validity or learning.

Review calibration: removing caller-owned retry orchestration can improve a reviewed
rating; padding implementation cannot; replacing many operations with `execute(any)`
only hides complexity if the caller still reconstructs policy. Do not award 1 merely
because an interface has one operation. Retain intrinsic domain decisions.

The CLI supplies observation identity, time, Git revision, observer email and exact-byte
manifests. It snapshots all tracked source outside state plus rubric/evaluator assets,
so freshness is conservative: even an unrelated tracked file change makes evidence stale.
This costs a read of tracked repository bytes. Input evidence must be tracked; untracked
sources cannot support a claim. Do not include generated reports in target inventories.

Use a fresh assessment ID for a new observation. Identical retries return the original
observation even after edits. Same ID with different input fails. Concurrent identical
retries converge. Writes publish complete fsynced records atomically; interruption before
publication may leave ignored `.tmp` files or unused snapshots, never partial observations.
Damaged stored records/snapshots fail visibly and remain untouched. Keep historical files.

Agents may propose and record evidence after reviewing it; they must label provisional
judgements and preserve unknowns/disagreements. Only actual learner answers and eligible
CLI learning events establish learner evidence. Architecture recording grants no practice.

## Compare captured observations

Run `node <CLI> architecture compare <before-id> <after-id> --json` for structured
facts; omit `--json` for readable evidence. `architecture compare-report <before-id>
<after-id> --no-open` creates a self-contained HTML report; omit `--no-open` to ask
the OS to open it. Failed opening still returns the report path.

Comparisons read immutable observations and their verified captured snapshots;
they never rerun analysis or tests. A stale observation remains a valid historical
baseline. Each side retains its independent current/stale label, original revision,
raw counts, denominator and limitations. Changes mean after minus before; missing
or incomparable values stay null, never zero. Reviewed ratings remain advisory.

Keep the logical module, membership, intended interface, representative scenario
identities/questions, exclusions and evaluator/rubric assets fixed. Changing one
makes the observations incomparable with a reason. Obligation counts and ratings
may change as the same representative behaviour improves. Adding unrelated cases
cannot improve a fixed-inventory comparison. Ordinary comparisons reject moves or
membership changes; explicit reviewed mappings arrive with reshaping exercises.
Recording, inspecting, comparing and reporting do not grant learning credit.
## Change locality

Record `dimension: "change-locality"` with the same `id`, `module`, `review`,
`evidence`, `exclusions` and `limitations` fields. Replace `scenarios` with:

```json
{
  "rules": [{
    "id": "minimum-order", "description": "Minimum order amount",
    "status": "confirmed", "equivalence": "Both sites apply the same order minimum",
    "evidence": ["policy.ts"],
    "sites": [{
      "id": "checkout-minimum", "file": "policy.ts", "location": "lines 10-12",
      "role": "policy", "implementation": null, "trustBoundary": null,
      "reason": "Independently maintained minimum", "evidence": ["policy.ts"]
    }]
  }],
  "changes": [{
    "id": "raise-minimum", "description": "Raise the order minimum",
    "affectedOwners": ["Checkout", "Sales"], "evidence": ["policy.ts"]
  }],
  "disagreements": []
}
```

These are additional fields, not a complete input. Rule status is `confirmed`,
`proposed` or `unclear`. Each independent policy site needs a stable identity,
distinct concrete source location, evidence and semantic explanation. A `call`
site instead names the implementing policy-site ID in `implementation`; it does
not inflate the independently maintained policy count. Two copies in one file
still count twice. Duplicate identities/locations and dangling calls fail validation.

The [experimental locality rubric](../scripts/architecture/change-locality-rubric.md)
averages `1 / independent policy sites` across the fixed confirmed-rule inventory.
Raw per-rule counts, the denominator and exclusions accompany the aggregate. Missing
sites/evidence make confirmed rules unavailable, never perfect. Proposed or unclear
rules stay visibly outside the confirmed denominator. A provisional proposal can be
inspected before acceptance; record the accepted review under a new ID so its original
evidence remains intact. Reviewer disagreements remain visible in reports.

Semantic equivalence requires human review: matching text or historical Git co-change
cannot establish that two sites own the same rule. Owner evidence belongs to explicit
representative changes; owners never enter the policy-site score. Put material owner,
rule or inventory definitions in tracked evidence files so edits mark earlier results
stale. Input definitions are immutable; comparisons must freeze their meaning.

Consolidating independent policy can help. Merging files without consolidating sites
cannot. Necessary repeated validation at distinct trust boundaries must remain: label
the boundary in `trustBoundary` and explain why it needs validation in `reason`. Reports
preserve this warning even when the raw count lowers locality. Scores remain advisory;
never remove necessary validation or award practice to improve a number.

For change locality, comparison freezes rule identities, descriptions, review
status and policy-equivalence meaning, plus representative change questions. Policy sites may consolidate within the fixed
module; raw independent-site and call changes accompany the value. Affected owners
remain separate observed evidence and may change after consolidation. Changed trust-boundary
justifications remain visible in the captured input for review. Different or absent
dimensions are incomparable; their missing facts never imply zero improvement.

## Behavioural testability

Use `architecture testability '<json>'` to execute **existing** tests and record their
CLI-owned results. `architecture record` cannot fabricate execution evidence. Inspection
and reports read captured results and never rerun tests. Use a new ID for new execution;
identical retries retain their original run even if sources have changed.

Use `dimension: "behavioural-testability"` with the common `id`, `module`, `review`,
`evidence`, `exclusions` and `limitations`. Add `discovery: "complete"` or `"incomplete"`,
`environmentRequirements: ["Node >=24", "required local services"]` and fixed `scenarios`:

```json
{
  "id": "calculate-total", "behaviour": "Return the order total",
  "failureInvariant": "Reject invalid quantities without saving",
  "intendedInterface": "orders.mjs",
  "assertion": {
    "status": "reviewed", "kind": "observable-outcome", "throughInterface": true,
    "explanation": "Checks returned total and invalid-quantity result through public API",
    "evidence": ["orders.test.mjs"]
  },
  "dependency": {
    "kind": "pure", "justification": "No external dependencies",
    "compatibilityRequired": false
  },
  "tests": [{"file": "orders.test.mjs", "name": "total and invalid quantities"}],
  "compatibility": []
}
```

The intended interface must belong to the declared module interface. Existing test
references name tracked relative files and exact top-level case names. Current execution
support covers Node's built-in test runner and top-level TAP cases; Node executes each
selected case with an exact escaped name filter. Nested cases, other test frameworks,
ambiguous case discovery and missing runtime/import dependencies yield unavailable
evidence. There is no fallback that turns suite exit zero into scenario coverage.
Each invocation has a 30-second timeout and a 2 MiB output bound. Failed and skipped
relevant cases remain separate from missing tests and unavailable discovery.

The CLI stores exact commands, exit codes, outputs, Node/platform and source/evaluator
manifests around execution. A tracked source edit during execution aborts publication.
Node/platform changes mark applicability stale. Track environment configuration and
external contract definitions as evidence. Ambient secrets and remote service state
are not snapshotted: reviewers must confirm requirements and rerun when those change.

Use dependency kinds `pure`, `local-substitute`, `owned-remote` or `true-external` with a
specific justification. Set `compatibilityRequired` for necessary production checks and
reference their existing cases in `compatibility`. Owned remote and true external adapters
always require checks. Local substitutes do not waive necessary contract verification.
A reviewed assertion must inspect meaningful outcomes through the intended interface;
`interaction-only` assertions and private helper checks do not establish orchestration
coverage. Review the concrete test body: execution alone proves no semantic coverage.

The [experimental rubric](../scripts/architecture/behavioural-testability-rubric.md)
shows qualifying/total scenarios plus individual gap, failed, skipped and unavailable
reasons. An agreed scenario with `tests: []` is a known gap, not an excuse to delete it.
Missing implementation tests need separate preparation work; do not write tests to make
a learner's architecture exercise pass. Rehearse with the repository's existing cases,
inspect the stored run diagnostics and identify preparation work separately.

Comparison freezes scenario identity, behaviour, failure invariant, interface, dependency
kind/required compatibility and environment requirements. Adding qualifying tests can help;
deleting hard scenarios changes the question, deleting tests creates gaps, and replacing
outcomes with mock-interaction checks never earns qualifying credit. These assessments
remain advisory and never grant learning evidence or safety percentages.
