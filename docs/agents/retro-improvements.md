# Accepted retro improvements

Scope: the completed architecture session's five retro recommendations, plus the
operator's choice of Lefthook for pre-commit. This follow-up is separate from PR13.

| Requirement | Evidence and counterexample |
| --- | --- |
| Run existing checks automatically with mandatory real-analyser coverage | `.github/workflows/verify.yml` installs pinned prerequisites and runs `pnpm verify:full`; `verification.test.ts` rejects missing/wrong prerequisites and exit-zero skipped suites. Hosted job results remain separate from local execution evidence. |
| Use Lefthook locally | `lefthook.yml` runs check/typecheck concurrently; the public hook rehearsal blocks malformed source and permits its corrected commit. |
| Isolate capture from ongoing edits | The verification CLI snapshots current source before checks. Its public test edits the live input while asserting the frozen bytes remain original; another deliberately edits the snapshot and is denied a receipt. |
| Discover remote tickets before stopping | The local implement-spec override checks the configured tracker and Git remote for local specs. Existing Architecture issues2–12 are discoverable through the repo's GitHub tracker; tracker failure is distinct from no tickets. This is an instruction improvement, not a claim of deterministic agent compliance. |
| Review observable evidence before dependent work | `implement-spec/references/acceptance-review.md` requires source states, outcomes, raw evidence and a counterexample; the implementer delegates criterion review before releasing dependents. Semantic evidence quality remains reviewer judgment. |
| Reduce instruction/verification repetition | The short CBP implementation recipe reaches detailed standards during review. Source-controlled overrides install with backups and drift detection. Exact input/profile receipts may be reused locally; CI always checks fresh. Public CLI tests verify reuse and changed-byte invalidation. |

Apply the shared [acceptance review](../../agent-skills/implement-spec/references/acceptance-review.md)
to this table before completion. Final verification produces a local receipt and
CI artifacts; link these from the PR instead of hard-coding a stale pass count here.
