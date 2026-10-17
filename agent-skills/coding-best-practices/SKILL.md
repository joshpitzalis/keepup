---
name: coding-best-practices
description: Implement and review code with test-first public behavior, explicit boundaries, existing repository conventions and focused review standards.
---

# Coding best practices

## Implementation

1. Read the repo's navigation/standards pointers and touched callers. Use its
   existing layout; use vertical slices for new behavior. Reach the feature-tree
   convention only where the repo leaves structure unspecified.
2. Establish the public behavior, relevant failure modes and accepted test seams.
   Use TDD for the red/green loop; use harden when state, dependencies, concurrency
   or persistence introduce meaningful failures.
3. Make the smallest complete change. Preserve validation, errors, compatibility
   and unrelated edits. Name concepts for their domain; use shallow control flow
   and parsed values rather than repeatedly validating raw input.
4. Reach focused references when the design needs them: parse-don't-validate for
   new parsers/state models; TypeScript style for type/API changes; the focused
   platform skill for platform work; the repo's E2E skill for browser tests.
   For Effect work, read [the principles](references/effect-principles.md) and verify
   APIs against installed source. For existing public/persisted contracts, read
   [compatibility](references/backward-compat.md).
5. Run focused checks while implementing. Before commit/push, run ponytail-review
   on the diff, then the required repo checks. Preserve a verification receipt when
   the repo supports one; reuse only matching coverage/inputs. Keep prose brief.

## Review

Read [review standards](references/review-standards.md) against the final diff and
connected callers. The reviewer owns the complete style/design audit; mechanical
rules belong in existing automated checks. Report concrete defects or maintenance
costs, with file locations and the smallest fix. Keep passing style from becoming
a substitute for the spec's observable acceptance evidence.
