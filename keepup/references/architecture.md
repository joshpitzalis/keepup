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

## Automated seam integrity (experimental v1)

`architecture analyse <json>` acquires a JavaScript/TypeScript dependency graph and
records an immutable automated observation. `record` rejects automated payloads;
graphs, findings, observation metadata and raw measurements are CLI-owned.
`inspect`, `list` and `report` also work for automated assessments and never rerun
the analyser. No learning events or ordinary file scores change.

Install the explicit prerequisite once in a dedicated directory, separate from the
skill and target repository. Node 24 is supported. Installation is never automatic:

```sh
npm install --prefix "$HOME/.local/share/keepup-analyser" --save-exact --ignore-scripts dependency-cruiser@18.6.0 typescript@5.9.3
export KEEPUP_ANALYSER_DIRECTORY="$HOME/.local/share/keepup-analyser"
```

Use this definition (all paths must be tracked regular repository files):

```json
{
  "id": "orders-seams-before",
  "dimension": "seam-integrity",
  "modules": [
    { "id": "orders", "members": ["src/orders/index.ts", "src/orders/private.ts"], "interface": ["src/orders/index.ts"] },
    { "id": "checkout", "members": ["src/checkout.ts"], "interface": ["src/checkout.ts"] }
  ],
  "rules": [
    { "id": "checkout-orders", "from": "checkout", "to": "orders", "kind": "public-only", "dependency": "all" }
  ],
  "evidence": [],
  "exclusions": [],
  "limitations": []
}
```

Rule `public-only` detects imports of private members; `forbidden` rejects the
specified direction entirely. `dependency` selects `all`, `runtime` or `type-only`.
Directions without rules are unconstrained. Membership cannot overlap. Interface
files re-exporting private implementation violate `public-only`, including named
and star re-exports: changing a barrel cannot silently repair a private import.
Explicitly declaring an exported implementation as interface changes the contract
and requires a fresh assessment/comparison inventory. This deliberately strict file
policy does not judge which exported operations constitute a good interface.

Each finding includes source file, line (when located), destination and rule. Raw
violation counts remain targets. Eligible edges count known cross-module
source/destination dependency relationships; more allowed relationships cannot
cancel violations. No composite architecture grade or percentage pass gate exists.
Zero eligible edges are not applicable; missing/incomplete graphs are unavailable,
even when they retain concrete valid findings. Measured zero violations differs
from unavailable coverage. Keep exclusions and limitations visible.

The pinned JSON config uses TypeScript compiler parsing, `tsPreCompilationDeps:
"specify"`, Node relative/package resolution and no traversal into `node_modules`.
JS/JSX, CJS/ESM and TS/TSX/CTS/MTS are supported with the pinned TS 5 compiler;
TypeScript 7 is not a replacement for this analyser prerequisite. Framework loaders,
TS path aliases and nonstandard bundler resolution are unsupported in this initial
config; unresolved imports show partial coverage. All tracked supported source files are acquisition roots, including callers outside
declared modules. Consumers outside declared membership that import declared modules
make coverage partial until their membership/rules are declared. Resolved untracked
sources, opaque and unresolved dependencies also make coverage partial. Add all
relevant callers to the declared inventory.
Literal dynamic imports retain destinations; computed imports/require calls use
the pinned compiler AST to expose opaque coverage. Repeated source specifiers may
be merged by dependency-cruiser, so mixed import forms are explicitly partial.
Custom loader functions and reflective runtime resolution are outside this static
analysis contract. Syntax the pinned compiler cannot parse yields unavailable.

The process runs from the target repository with the shipped JSON config, all tracked supported
source paths, a 30-second timeout and 16 MiB output bound. Environment variable
`KEEPUP_ANALYSER_TIMEOUT_MS` may lower the timeout (1–30000 ms). Tool absence,
version mismatch, failure, malformed output and timeout create unavailable records
under fresh IDs; identical retries return the original observation without running
the tool. Changing source during analysis rejects the mixed observation entirely.
Earlier observations remain intact.

The CLI snapshots exact tool implementation/configuration and transitive resolver
assets (JS/JSON plus installation lockfile), alongside source and evaluator assets.
Changing installed tool bytes with the same version makes results stale; inspection
hashes assets without executing tools. Use the documented npm installation layout;
symlinked package-manager layouts are not supported. Capture/inspection cost scales
with repository and tool installation bytes; graphs cost one analyser process plus
compiler AST inspection. Copied skill installations use this explicit prerequisite,
never dependencies from the Keepup development checkout.

Development verification: set `KEEPUP_TEST_ANALYSER_DIRECTORY` to the same pinned
installation and run `node --test keepup/__tests__/architecture-seams.test.ts`.
Real fixture cases cover private/public edges, repair, types, opaque imports,
unresolved dependencies and re-export laundering; controlled process failures check
that old records survive. Without this test prerequisite, real-analyser cases skip
and the ordinary unavailable-tool path still runs.

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

## Prohibited logical module cycles (experimental v1)

Add optional `cycles` to a seam definition to enforce a cycle policy through the
same `architecture analyse` operation, graph acquisition, stored evidence and
report. Existing definitions without this field retain their original meaning and
serialized input: no cycle policy is implied retroactively.

```json
"cycles": {
  "id": "no-runtime-cycles",
  "dependency": "runtime",
  "exceptions": [
    {
      "id": "recursive-types",
      "modules": ["types-a", "types-b"],
      "reason": "Reviewed mutually recursive public types"
    }
  ]
}
```

Choose `runtime`, `type-only` or `all` explicitly. `all` includes mixed runtime/type
paths. External, unresolved and internal same-module edges do not become logical
module cycle edges. A logical module cycle can span separate implementation files
without any single file cycle: the finding concerns dependency direction between
declared modules, not execution recursion.

Count **one prohibited strongly connected group**, regardless of overlapping
cycles or traversal order. A strongly connected group contains at least two logical
modules that can all reach one another. `cyclicGroups` displays this absolute count;
each prohibited group adds one `prohibited-cycle` finding to raw seam `violations`.
Edge-policy findings remain separate entries in that total. Never substitute a
percentage or an eligible-edge denominator for either raw target.

Each group preserves sorted module identities, the cycle policy ID and a
deterministic closed explanatory walk through every member. A walk may revisit a
module when cycles overlap. Every step retains an actual source-file dependency,
line, destination and dependency kind. Adding more edges or reordering files cannot
conceal an existing group. Removing one of several overlapping loops can leave one
prohibited group; inspect the remaining path rather than treating a smaller drawing
as success.

Exceptions permit an **exact entire strongly connected group**, identified by its
sorted module inventory. They never remove edges from the graph. The group and
complete path remain visible with `permittedBy`, and the definition retains the
exception's identity and rationale. An exception for A/B does not exempt a larger
A/B/C group. Changing a policy or exception makes ordinary comparison incomparable;
it cannot count as repairing an old target.

Incomplete graphs retain known groups but cannot establish cycle freedom. A
reported known count of zero with partial/unavailable coverage is not proof that
no prohibited cycle exists; comparisons with incomplete coverage remain
incomparable. A complete acyclic graph can report raw zero even when a percentage
would have no eligible-edge denominator. Architecture assessment remains separate
from learner understanding and grants no learning events.

The implementation uses repeated reachability on the declared module graph and
deterministic breadth-first evidence paths. This suits small local module
inventories; very large inventories would need a linear SCC algorithm. It does not
parse another language or invoke a second analyser. Use the same pinned prerequisite
and copied-install workflow as seam analysis.

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

## Navigability

Record `dimension: "navigability"` with the common `id`, `module`, `review`, `evidence`,
`exclusions` and `limitations` fields and a fixed `questions` array. Each question has:

```json
{
  "id": "save-failure", "question": "What happens when saving an order fails?",
  "owningModule": "orders", "trailStatus": "complete",
  "readability": "coherent", "readabilityExplanation": "Failure handling stays understandable",
  "evidence": ["orders.ts"], "namingIssues": [], "disagreements": [],
  "trail": [{
    "id": "storage-error", "moduleId": "storage", "file": "storage.ts",
    "location": "lines 20-28", "kind": "implementation", "necessary": true,
    "reason": "Must inspect storage to understand which failures are translated"
  }]
}
```

Preserve the exact comprehension question and its owning module. Use `owningModule:
null` for ambiguous ownership and `moduleId: null` for unresolved necessary attribution;
both stay unavailable. The known owner must match the assessment's declared module.
`trailStatus` is `complete`, `incomplete` or `unresolved`. A sufficient trail requires
concrete evidence and at least one source location. Steps identify reviewed logical
module ownership and explain why their implementation must be inspected to answer
this question. Record a sufficient semantic explanation, never an accidental browsing
sequence, elapsed time or token count. Shared evidence can support several fixed questions.

The [experimental v1 rubric](../scripts/architecture/navigability-rubric.md) averages
`1 / (1 + transitions)`. Starting at the owner, count logical-module boundaries in the
ordered **necessary implementation** trail, including return crossings. Several steps
in the same module add no crossing. `interface` references and `private-helper` steps
do not count. Hidden helpers use `necessary: false`; a helper whose implementation
really must be inspected belongs in the implementation trail instead. Unnecessary
browsing can remain documented with `necessary: false` without changing counts.

Reports show raw per-question transitions and values plus the aggregate. Incomplete,
unresolved, owner-ambiguous or unsupported trails retain `observedTransitions` as a
partial diagnostic; their full count/value and the aggregate remain unavailable.
Zero questions also remain unavailable. Source freshness includes every evidence and
trail file through the shared immutable manifests, including callers and definitions.

Review internal readability as `coherent`, `unclear` or `consolidation-obscures` and
explain the judgement. A giant file can hide navigation rather than improve it:
unclear/obscured readability makes the question unavailable even with zero observed
crossings. Removing a pass-through that truly requires inspection can improve the
score; private helpers hidden behind a useful interface do not lower it. Preserve
interface leverage rather than moving policy burdens into callers to reduce navigation.

Keep `namingIssues` and `disagreements` visible. Navigability asks **where you must look**
to understand a behaviour; change locality asks **where policy must change**. They share
possible evidence but cannot substitute for one another. Reviewed scores never establish
learner understanding, grant quiz credit or enter file-health averages. Comparison freezes
question identities, exact wording, owners and module membership; a different question
cannot conceal missing evidence or establish an improvement.
