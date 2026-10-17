# Review standards

Apply the repo's documented conventions first. Tool-enforced rules need not be
reported again. Reach the focused skill only when the diff touches its concern.

- **Behavior:** trace inputs, errors, state and side effects through callers;
  inspect public-seam tests and the originating acceptance criteria. Judge evidence
  quality separately from green tests or expected score literals.
- **Structure:** use vertical slices and the repo's existing layout. Reach
  refactor-ddd's convention only for unspecified/new structure, not as a request
  for a repository-wide migration. Colocate behavior and preserve clear interfaces.
- **Control flow:** use never-nest to inspect excessive branches/nesting; prefer
  guard clauses and extractions that clarify a real job. Preserve validation/errors.
- **Names:** use domain names, searchable vocabulary and stable terms. Reach namer
  for ambiguous concepts; avoid renaming solely for taste.
- **Types:** audit parse-don't-validate at boundaries and state transitions. For
  TypeScript, read typescript-style: precise discriminants, readonly data, named
  exports, top-level type imports, explicit top-level return types and checked
  indexing. Avoid type assertions that conceal unparsed input.
- **Compatibility:** when callers or saved formats already exist, apply
  [backward compatibility](backward-compat.md); old records and retries remain
  readable and existing callers retain their behavior unless deliberately changed.
- **Lean code:** apply ponytail-review before commit/push. Reuse existing code or
  platform features; remove speculative abstractions, options and dependencies.
  Every finding needs a concrete case and smallest complete fix.
- **Robustness:** reach harden for stateful work; inspect malformed input, dependency
  failures, retries, interruptions, source/time races and recovery where relevant.
- **Platform:** use the focused Cloudflare/XState/browser skill only for touched
  integrations. Use existing Cypress conventions or Playwright where appropriate.
- **Effect:** for Effect code apply [the principles](effect-principles.md), check
  the installed major/API, and preserve boundaries, resource lifetimes and errors.

Keep observations short and actionable. Separate hard documented violations from
judgment calls. Preserve public behavior and test seams during review fixes. Avoid
new prose rules for patterns that a deterministic linter/hook/CI check can enforce.
