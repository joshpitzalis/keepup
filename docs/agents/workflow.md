# Working on Keepup

Use the existing script/module layout. Read [the issue tracker](issue-tracker.md)
before deciding tickets are missing. Keep learning commands confined to disposable
test repositories; the operator's active learner state is outside this workflow.

## Each slice

Implement one public behavior at a time using focused CLI tests. Before releasing
its dependent tickets, review [acceptance evidence](../../agent-skills/implement-spec/references/acceptance-review.md).
Record the criterion, source change, observable outcome, raw evidence, counterexample,
and remaining limit in the ticket's evidence notes. A green assertion about supplied
metadata alone does not demonstrate a source improvement.

## Checks and receipts

Install dependencies with `pnpm install --frozen-lockfile`; the pinned Lefthook
pre-commit hook runs formatting/lint checks and TypeScript concurrently. It reads
the working tree and does not rewrite or stage files. CI remains the full gate.

Set `KEEPUP_TEST_ANALYSER_DIRECTORY` to the installation prefix documented in
[the architecture workflow](../../keepup/references/architecture.md). `pnpm verify`
fails before checks if the pinned analyser is absent/wrong, snapshots source bytes
and modes, then checks formatting/lint, TypeScript and all Node tests against that
snapshot. Zero-case, skipped, cancelled, pending or failed Node suites cannot pass.
`pnpm verify:full` also runs Chromium and is the CI entry point.

Snapshots contain tracked working bytes (including staged additions/deletions) and
nonignored new files in code/test/tool/docs/skill/workflow directories plus named
root configuration files. Stage other new root files before verification. Learner
state, dependencies and generated verification artifacts are excluded. Installed
development dependencies are shared read-only by convention and must match the
frozen lockfile. Keep dependency installs separate from verification runs.

Successful receipts in `.verification/receipts/` include source manifests, Git
revision, Node/OS, environment hash, analyser version/fingerprint, commands and
durations. Environment values are not saved. Receipts describe captured bytes,
not edits made afterward. Use `pnpm verify:reuse` to reuse an exact full-profile
receipt; changed inputs run fresh checks. CI always executes checks. Browser
artifacts survive snapshot cleanup under `.verification/artifacts/`.

Run focused checks during implementation and after a local merge; run full
verification at integration milestones and after the final source change. Link
the receipt rather than repeating an unchanged full run. A receipt is local
execution evidence, not independent CI or a proof of arbitrary correctness.

## Agent skills

Reviewed local overrides live in [agent-skills](../../agent-skills/README.md).
Install them with `node scripts/install-agent-skills.ts`; use `--check` to verify
installed bytes. Plugin caches remain vendor-owned. Implementation loads the short
recipe; reviewers read the standards reference when reviewing the diff.
