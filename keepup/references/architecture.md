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
