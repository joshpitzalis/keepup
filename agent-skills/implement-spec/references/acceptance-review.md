# Acceptance review before releasing dependent work

The reviewer checks the originating ticket's criteria through public behavior.
Keep the implementation agent's task brief; link this review reference.

For each criterion, record:

| Criterion | Evidence | Counterexample | Limit |
| --- | --- | --- | --- |
| Exact ticket criterion | Test/artifact/CLI output and captured source | Case that should fail or stay unchanged | What the evidence cannot establish |

For a claimed architectural improvement, inspect both source states, the preserved
observable behavior (including relevant invalid inputs), and the raw measurement.
Changing only an inventory/rating is evidence about a rubric, not an implementation
improvement. Inspect the cited implementation to judge whether the evidence fits.

At derived views or durable state boundaries, follow claims back to their source,
tool and definition dependencies. Change one material dependency and verify the
final consumer becomes stale, unavailable or rejected; a stale inner record must
not leave an outer recommendation current. Include the commit, scope and command
or verification receipt so another reviewer can reproduce the check.

Release dependent tickets only when each criterion has adequate evidence or an
explicit spec-approved limitation. Missing evidence stays incomplete. Put genuine
judgment in the review; make mechanical syntax/location rules deterministic checks
in the repository's existing linter, hooks or CI.
