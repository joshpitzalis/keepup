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

## Recommend bounded opportunities

Use `architecture opportunity record <json>` to record a **proposed qualitative
recommendation**, `opportunity inspect <id> [--json]` to recover it, and
`opportunity report <id> [--no-open]` for the same facts in HTML. These operations
never refactor source, execute tests, or write learning events.

Before proposing work, read the current findings and the learner's supplied
mission or next change. Read any supplied tracked glossary/ADR paths; cite a
conflict explicitly rather than editing or overriding a decision. Do not invent
incidents, future work or learner gaps. Optional hotspot evidence can inform the
explanation when supplied; no activity engine or hotspot dependency exists here.
A valid answer may recommend no refactor.

The JSON has these required fields (use explicit null or empty arrays for absent
context, target, conflicts or evidence):

- `id`, `behaviour`, `modules`, `outcome`, `scope` (existing tracked source paths),
  `risks`, `stopCondition`, and `limitations` describe the bounded work.
- `findings`: `{assessmentId,description,evidence:[tracked paths]}` entries link
  interpretations to captured assessments. The CLI verifies source membership;
  the agent must justify why the observation supports the recommendation.
- `context`: `{mission:string|null,nextChange:string|null,documents:[paths]}`;
  `relevance:string|null` explains the connection to that supplied context.
  Documents retain captured exact-byte provenance and readable text.
- `strength`: `strong`, `worth-exploring`, or `speculative`; these are qualitative
  judgments, never fabricated probabilities. Unsupported relevance becomes
  speculative, with an explicit deferred refactor.
- `decision`: `refactor`, `assessment`, `preparation`, `defer`, or `none`.
- `rawTarget`: `{assessmentId,metric,goal}` or null. Supported raw counts are
  `avoidableObligations`, `independentPolicySites` and `violations`, according to
  the linked dimension. The CLI supplies the captured baseline; the proposed
  nonnegative goal must strictly reduce it. Reviewed targets remain advisory.
- `verification`: `{testCommand:string|null,readiness,evidence:[test paths],
  invariants:[behaviours]}`. Readiness is `reviewed-ready`, `unknown`, or
  `inadequate`; the command must match the configured existing suite. Reviewed
  readiness records the proposal's evidence, not a claim that tests ran.
- `conflicts`: `{document,description}` entries citing supplied context paths.

A stale/incomplete/provisional finding becomes assessment work. Inadequate
behavioural checks become test preparation. Missing scope/target becomes an
assessment; glossary/ADR conflicts defer work. Missing dimensions remain visible
and are never healthy defaults. Revisit a stale opportunity against new evidence;
inspection does not rerun evaluators or silently update its original decision.

Architecture exercises remain unavailable in this phase. A recommendation is
separate from exercise acceptance and grants no exposure, practice, understanding
or delayed retention evidence. The learner owns all eventual code and test edits.
