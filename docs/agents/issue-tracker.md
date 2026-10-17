# Issue tracker

Use GitHub Issues in `joshpitzalis/keepup`.

- Read a ticket: `gh issue view NUMBER --repo joshpitzalis/keepup`.
- Architecture specification: `plans/architecture-assessments.md`.
- Architecture phases 1–11 correspond to issues #2–#12. Each ticket's
  **Blocked by** section defines its prerequisites.
- Architecture implementation lives on `feat/architecture-assessments`, based on
  `feat/typescript-ultracite` (PR #1). This is a navigation pointer for that plan;
  use the active task's chosen branch/base for follow-up work.
- Resolve tickets through closing references in the integration PR. Keep
  tickets open while the PR remains unmerged; mark the PR ready after review.
