---
name: implement-spec
description: "Implement a specification in code. Orchestrates parallel implementer subagents over the spec's ticket task-graph, producing one PR on one branch."
argument-hint: "<spec: GitHub issue number/URL, or local markdown path>"
disable-model-invocation: true
---

# Implement Spec

The goal is a single PR, on a single branch, implementing the entire spec.

## Locate the spec and tickets

The argument names the spec. Two forms:

- **GitHub issue** (number or URL): the tickets are its sub-issues or linked issues. Blocking relationships come from task lists and "Blocked by #N" references. Use `gh` to read them.
- **Local markdown** (e.g. a file in `plans/`): the tickets are sections of the file or sibling ticket files it links to. Blocking relationships are stated in the ticket text.

For a local spec, read the configured issue tracker (normally `docs/agents/issue-tracker.md`) and repository remote before declaring tickets missing. If local sections contain no ticket links, query the configured tracker: for GitHub, use `gh repo view --json nameWithOwner` and `gh issue list --state all --limit 100 --json number,title,state,body,url`, matching the spec path/topic and dependency references. Follow pagination/search if needed; keep fetched bodies in the session notes. A local Markdown path does not imply local-only tickets.

No argument given: ask which spec. Stop for missing tickets only after checking both local and configured remote sources. Distinguish an inaccessible tracker (authentication/network) from an empty result. Report which sources were checked; do not invent tickets.

## The task graph

The tickets are not a list of steps. They are a **task graph** with blocking relationships. At any moment there is a **frontier**: tickets whose blockers are all complete. Work the entire frontier concurrently — one implementer subagent per frontier ticket, run in the background. Serializing frontier tickets throws away the whole point of the breakdown.

## Context pointers

Communication to and from subagents should be sparse. Communicate through **pointers**: to the spec, a ticket, the research notes directory, previous commits. Don't paste content a pointer already reaches — duplicated prose bloats subagent context and drifts out of date as commits land.

## Steps

1. **Read the spec and tickets.** Read enough to build the task graph: every ticket, its blockers, the initial frontier.

2. **(optional) Exploration subagent.** If tickets require codebase or documentation research, run one exploration subagent up front. It saves markdown notes to a directory **outside the repo** (use the session scratchpad) so every later subagent can read them without leaving stray files in worktrees. This lets implementers implement instead of re-exploring.

3. **Branch and draft PR.** Create the PR branch and open a draft PR. GitHub spec: mark the PR as closing the spec issue and each ticket. Local spec: link the spec path in the PR body.

4. **Implementer subagents.** For each frontier ticket, launch a background implementer in **its own worktree, on its own branch**. Its prompt contains only: pointer to the ticket, pointer to the spec, notes directory path, worktree path, branch name, and the instruction to commit its work with tests passing.

5. **Merge on completion.** When an implementer finishes, a **merger subagent** merges its branch into the PR branch. Run mergers one at a time — concurrent merges into the same branch race. The merger resolves conflicts in favor of the spec's intent and runs affected checks after merging. Use focused checks during implementation/merges and full verification at integration milestones and the final source state. When the repo supplies verification receipts, link a receipt for exactly matching source, scope and prerequisites instead of repeating unchanged coverage; CI executes fresh checks.

6. **Review acceptance evidence.** Before marking a ticket complete or releasing its dependents, have a reviewer check [acceptance evidence](references/acceptance-review.md) against every criterion. Save its evidence pointers, counterexamples and limits in the ticket notes. Missing evidence stays incomplete even if tests are green. Mechanical checks use the repo tooling; genuine judgment stays with the reviewer.

7. **Advance the frontier.** A reviewed, merged ticket may unblock others. Recompute the frontier and immediately launch implementers for newly available tickets. Maximum concurrency comes from doing this eagerly, not after everything else finishes.

8. **Code review.** Once all tickets are merged, run /code-review on the PR branch. Fix everything it raises in a single implementer subagent, merged the same way.

9. **Mark the PR ready for review.**

10. **Clean up all worktrees** — including those of failed implementers.

## When things fail

- **Implementer fails**: retry once, adding a pointer to the failure output. Fails again: leave that ticket and its dependents blocked, keep working the rest of the frontier, and report the stuck ticket when done.
- **Merger cannot resolve a conflict confidently**: stop and surface it rather than guessing — a wrong merge silently corrupts every ticket built on top of it.
- **Code review demands something the spec contradicts**: follow the spec, note the disagreement in the PR description.
