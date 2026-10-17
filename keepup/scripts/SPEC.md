# Keepup learning CLI

## Problem

A learner needs an initial picture of code quality and recorded understanding,
then short ways to practise while agents work. File complexity alone cannot
describe architecture, and automated assessment cannot prove comprehension.

## Solution

`keepup.ts` owns repository/state resolution, file scorers, learning evidence,
history and command dispatch. Setup adopts a dated starter mission while preserving
personalised missions. The agent's initial-assessment workflow prepares and executes
the six dimensions, then asks the CLI to combine explicit stored assessment IDs.

`code-health.ts` reads current validated architecture observations, retains their
raw measurements/provisional labels and averages modules within each dimension,
then averages available dimensions equally. Boundary/cycle health uses the documented
experimental inverse-count rule. Raw file metrics, missing source memberships,
dimension coverage and source identity survive in immutable local reports.
The selected assessment plan is replaced atomically for future `health` reads.

`architecture/` owns independent evidence, rubrics, analysis and exercises; see its
[spec](architecture/SPEC.md). Aggregation never changes records or pass gates.
`handlers/` reconstructs supported learner events; the CLI is the only event writer.

## Boundaries

- Agent `init` orchestrates semantic source review and tools. Bare CLI `init` only
  establishes state, so existing scripts and fixtures remain compatible.
- Fresh/provisional dimensions are advisory; stale or unavailable observations do
  not become zero or perfect. Duplicate module records cannot increase weight.
- Architecture membership coverage uses common source extensions; its file list
  and semantic exclusions still require agent review. A full attempt may have gaps.
- Source changes during aggregation abort publication. The snapshot is local
  execution evidence, not a security attestation or a proof of arbitrary correctness.
- Comprehension debt continues to use actual learner evidence and drift. A standalone
  quiz records real answers through existing events; assessment alone grants no credit.
