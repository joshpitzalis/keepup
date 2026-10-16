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
