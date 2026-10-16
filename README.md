# keepup

A skill for Claude Code and Codex for understanding and practising refactors in an agent-built repository. Learning state lives in the repository's `.keepup/` directory.

In Claude Code:

```text
/keepup status   — see debt, code health and due checks
/keepup kata     — start a short refactoring exercise
/keepup on       — learn one item at a time until you say stop
/keepup map      — open your learning map
```

Run `/keepup init` once per repository first. Finish exercises with `/keepup submit`; use `/keepup check` for delayed recall.

In Codex, use `$keepup`:

```text
$keepup init
$keepup status
$keepup kata
$keepup on
$keepup map
$keepup submit
$keepup check
```

## Install

Install for Claude Code across your projects:

```sh
npx skills@latest add joshpitzalis/keepup --skill keepup -g -a claude-code -y
```

Or install for Codex across your projects:

```sh
npx skills@latest add joshpitzalis/keepup --skill keepup -g -a codex -y
```

Requires Git, Node.js **24.8 or newer**, and Claude Code or Codex. The bundled complexity scorer also needs [uv](https://docs.astral.sh/uv/getting-started/installation/); it runs lizard through `uvx` on demand. The installer copies the skill bundle; install these prerequisites separately. The skill has no Node runtime dependencies.

Open your project in Claude Code and invoke `/keepup init`, or in Codex and invoke `$keepup init`. Restart your agent if the newly installed skill does not appear. The skill interviews you about why the code matters, success, constraints and exclusions, then records that mission. Keep the mission within one screen. It requests your existing test command when inference cannot find one.

Codex skill discovery and `$` invocation follow the [official OpenAI documentation](https://developers.openai.com/codex/skills). The shared CLI and GitHub installation have been tested; the full teaching workflow in Codex has not yet been verified.

Update the installed skill with:

```sh
npx skills@latest update keepup -g
```

Restart your agent after updating. Existing project learning state stays in the project.

For deterministic setup without the interview:

```sh
node ~/.claude/skills/keepup/scripts/keepup.mjs init
```

CLI examples below use the Claude Code installation path. For Codex, replace `~/.claude/skills/keepup` with `~/.agents/skills/keepup`. In Codex prompts, replace `/keepup` with `$keepup`.

Run checks in this source checkout with:

```sh
pnpm install
pnpm verify
```

## Linting and formatting

[Ultracite](https://www.ultracite.ai/) configures Oxlint and Oxfmt through `oxlint.config.ts` and `oxfmt.config.ts`.

- `pnpm check` checks lint and formatting without changing files.
- `pnpm fix` applies safe lint fixes and formatting. Rerun `pnpm check` afterward; formatting can expose additional spacing fixes.
- `pnpm lint` runs Oxlint and fails on warnings; `pnpm format` formats files only.
- `pnpm verify` runs lint/format checks, strict TypeScript 7 checking, and all tests.

All 18 generic [anti-slop rules](https://github.com/dmmulroy/anti-slop), its five Effect rules, and native `oxc/no-accumulating-spread` are enabled as errors. The plugin is vendored unchanged in `tools/oxlint/anti-slop/`; `UPSTREAM.md` records the revision and both upstream licenses are retained. Keep `oxlint` and `@oxlint/plugins` on the same exact version when upgrading.

Documented exceptions preserve the current hand-written input parsers, generic pipe implementation, open evidence payloads and invalid-input tests. Validated branded assertions require `SAFETY:` explanations; one phantom tuple brand still needs a justified chained assertion. Two existing workflows have local complexity exceptions. Function declarations, local helpers and POSIX permission masks retain the project's conventions. Other application code receives the full anti-slop ruleset, and a CLI smoke test checks that representative violations fail.

Learning state, installed agent assets and vendored rules are excluded from checks; Markdown is excluded from formatting. These tools are development dependencies and do not change skill installation or introduce Effect into runtime code. No Git hooks are installed.

## TypeScript and Effect

Node 24.8+ runs the TypeScript source directly; no build step or TS loader is needed. `pnpm typecheck` checks the CLI, event parsers, scorer and tests in strict mode. `pnpm test` runs the CLI regressions and an Effect import/runtime smoke test. The browser map remains inline JavaScript so the generated HTML opens without a build step.

The existing `scripts/keepup.mjs` command delegates to `scripts/keepup.ts`. The skill's own `package.json` declares ESM so copied installations work inside CommonJS projects too. The executable `scorers/complexity` launches its non-executable `complexity.mts` companion; keep both files when copying or distributing it.

Effect **4.0.5** is pinned as a development dependency for refactoring in this checkout. Import from `"effect"` when needed. The shipped CLI does not use it yet, so installing the skill still requires no Node dependency installation.

Introduce Effect at one complete command workflow at a time: for example, the Git/file/scorer work coordinated by `computeStatus`, or the lock/snapshot/append work coordinated by `logEvent`. Keep calculations such as `answerAccuracy` and `lineCount` as ordinary TypeScript. Keep the current event parser synchronous until a refactor benefits from typed errors or Schema decoding.

Within an adopted workflow, describe fallible I/O with named effects and compose them; run the program once at the CLI boundary. Preserve lock release, snapshot-before-append ordering, retry identity, timeouts and visible failures. Do not run an Effect separately in every helper or retry state writes indiscriminately. Add services and layers only when the workflow needs dependency substitution or resource management.

Before importing Effect into shipped runtime code, update the skill's distribution so a copied installation can resolve it independently of this checkout, then extend the copied-install regression test. The root development dependency alone does not travel with an installed skill.

## Configuration

Edit `.keepup/config.json` to change your test command and tracked-file scope:

```json
{
  "testCommand": "pnpm test",
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["**/*.generated.ts", "**/node_modules/**", "**/dist/**", "**/build/**"]
}
```

The default include pattern is `**/*`. Patterns use Node's `path.matchesGlob` syntax and paths relative to the main repository root. Only tracked regular files can enter scope; learning state and Git internals are always excluded. Commit newly created source files before they become learning targets. Deleted files and symlinks are excluded.

Setup infers a test command from a package's test script and package-manager declaration or lockfile. Without a usable script it stores `null`; enter your real command before submitting a kata. The CLI never substitutes a passing command.

Setup preserves existing config, mission, logs, snapshots and custom scorers. It copies only missing bundled scorers. Running from a subdirectory or linked worktree uses the main checkout's state and tracked scope. Katas run in place; separate kata worktrees are outside v0.

Commit `.keepup/` so learning evidence travels with the project. Setup adds only `.keepup/map.html` to `.gitignore`; the map is generated. Check your existing global or parent ignore rules if state does not appear in Git.

## Status and scorers

```sh
node ~/.claude/skills/keepup/scripts/keepup.mjs status
node ~/.claude/skills/keepup/scripts/keepup.mjs status --json
```

Status shows line-weighted code health, cognitive debt, learner state coverage, due checks and the ten highest-debt files. JSON includes every scoped file and every available metric. The first status has no baseline; later deltas compare with the preceding status for the same Git email. Status appends summaries to derived `.keepup/history.jsonl`; history is not learning evidence.

Drop an executable into `.keepup/scorers/` to add a scorer. Each runs from the repository root with newline-delimited scoped paths on stdin. `KEEPUP_STATE` identifies the state directory and `KEEPUP_LEARNER` the Git email. Emit JSON lines such as:

```json
{"file":"src/example.ts","metric":"complexity","value":0.5,"raw":10,"line":12,"fn":"parseRequest"}
```

`value` must be between zero and one; higher means healthier code. `raw`, `line` (one-based) and `fn` are optional. Each file/metric pair must be unique across scorers. Missing reports mean no opinion. Non-executable files are ignored; failed scorers and malformed scorer output produce warnings while other scorers continue. Scorers have a two-minute timeout. Repository scorers execute local code, so review them before running status in an unfamiliar repository.

The bundled complexity scorer invokes `uvx lizard --csv -i -1` and reports the worst function's CCN, name and starting line. Its score is `min(1, 5 / CCN)`. Files without reported functions have no complexity opinion. The scorer supports lizard's languages, including TypeScript, Python and Go. Installation copies missing bundled scorers only; rerunning init never replaces a repository's edited scorer.

A file's code score averages its reported metrics. Code health averages known scores by file lines and reports scored-line coverage. Unscored files display unavailable; debt conservatively treats their code score as zero. File debt weights size relative to the largest file, multiplied by `0.25 + 0.75 × (1 − code score)` and then by `1 − mind`. Unknown clean code still carries learning debt. Empty scopes and zero-line denominators show unavailable headlines. Coverage is measured by lines, not file counts.

## Learning evidence

Only `log` writes learning events. For example, after actually showing a card:

```sh
node ~/.claude/skills/keepup/scripts/keepup.mjs log '{"id":"card-unique-attempt","type":"shown","files":["src/example.ts"],"depth":"walkthrough"}'
```

Every input needs a nonempty `id`, a `type` and a nonempty array of unique scoped `files`. Reuse the same id when retrying an operation: the CLI returns its original event and snapshots, even after files change. An id reused with different input fails. A genuinely new attempt needs a new id. Retry identity is per Git email; kata numbers are repository-wide.

| Type | Additional input |
| --- | --- |
| `shown` | `depth`: `walkthrough`, `paragraph`, `line`, or `none` |
| `response` | `response`: `got-it`, `skip`, `kata`, or `next` |
| `quiz` | `phase`: `pre`, `post`, or `check`; nonempty `answers`, each `{file,concept,question,answer,correct}`; optional `kataNumber` |
| `explain` | Nonempty `text`; optional `kataNumber` |
| `hint` | Nonempty `text` and `kataNumber` |
| `kata_start` | Nonempty `technique`, `module`, and `target: {file,metric,goal}` |
| `kata_submit` | `kataNumber`, `result`: `pass`, `fail`, or `abandon`; optional `checks` object |

Every quiz file must have an answer, with nonempty strings for its concept, question and answer, and a boolean correctness judgment. The teaching agent supplies this judgment from the learner's actual response. Selecting or acknowledging a file does not grant quiz accuracy. Only shown cards, started katas and actual quizzes grant exposure. Post answers have half weight; accuracy uses the last ten individual answers for each learner/file. Without delayed verification, quiz mind is capped at 0.6. Exposure without quizzes grants 0.3; a passed kata adds 0.1, capped at 1.

The CLI owns `t`, `who`, `sha`, `snapshots`, `retryDigest`, assigned start `kataNumber` and `baseline`; unknown or protected input fields are rejected. Continuations reference an existing kata for the same learner, using only that kata's files. Pass or abandonment closes a kata; failed attempts leave it active. `status.katas` includes all of the learner's starts, their full context and baseline, `active`, `submissions`, `hints`, `quizzes` and `explanations`.

A kata starts only on clean target files, including the index. Start captures the commit, scoped content and scoring definitions before running scorers, then rechecks them and target cleanliness; concurrent changes reject the start without appending an event. Starting snapshots use those captured bytes. Its numeric goal must strictly exceed an available target metric score and lie in 0–1. The CLI captures every scoped file's scores and SHA256 current-content hash in `baseline.files` and `baseline.contentHashes`; the baseline also stores summaries, metric names and scorer warnings. These hashes permit detecting touched files across later commits without attributing pre-existing unrelated edits to the learner. The CLI also captures `baseline.definitionHashes`, mapping `config.json` and every executable `scorers/<name>` plus the bundled `scorers/complexity.mts` source to their SHA256 bytes. Submit compares these definitions and the executable-scorer set before accepting baseline comparisons; changing scope, test command or scorer code (including its TypeScript source) requires a fresh kata. Baseline hashes grant no learning evidence. The teaching workflow runs the existing tests and scorer guardrails before reporting a passed submission; the event log records that assessment.

Snapshots preserve exact bytes under their SHA256 hashes. Shown cards, quizzes, kata starts and passed submissions snapshot their associated files. The newest evidence snapshot determines drift: additions plus deletions divided by its line count, capped at one. A replacement counts as two changes. Empty snapshots have zero drift when unchanged and full drift otherwise. Missing, damaged or changed binary snapshots conservatively mean full drift with a warning. Mind is multiplied by `1 − drift`; practice falls back to exposed only above 0.5 drift. Another learner's evidence never changes your scores.

Event and history writers share an exclusive state lock. A busy writer causes a bounded retry followed by an actionable error; no lock is deleted based on age. A malformed or incomplete event log is refused without rewriting it. Snapshot writes finish before their event is appended. Set `KEEPUP_NOW` to an ISO timestamp for deterministic time-based checks.

## Delayed checks

`/keepup check` follows the bundled one-question workflow. Status marks a file due after a full 24 hours and a later UTC date since its latest pre/post quiz not consumed by a delayed check. A new pre/post quiz restarts the initial-quiz interval but never postpones an already-due seven-day weak-verification check. The CLI rejects early checks and requires exactly one answer about one file, preserving the log on rejection.

A correct due answer grants verified state and removes the 0.6 quiz cap. An incorrect answer affects accuracy and consumes that occurrence, without granting verification or erasing prior successful verification. Previously verified files below 70% accuracy become due again seven days after their latest qualifying check; exactly 70% does not trigger recurrence. This rule includes practised files with successful delayed-check evidence. Practice alone does not count as verification. Heavy drift above 0.5 displays verified/practised files as exposed while retaining their evidence; mind still uses accuracy multiplied by `1 − drift`.

## Repository map

Invoke `/keepup map`, or run:

```sh
node ~/.claude/skills/keepup/scripts/keepup.mjs map
```

The CLI computes status once, appends one derived history entry and writes `.keepup/map.html`. It attempts to open the map in your system browser and returns JSON containing `path`, `opened` and scorer/opening `warnings`. If automatic opening fails, open that path manually.

Directory regions contain file boxes sized by lines. The default colours show dark, exposed, verified and practised states. Choose a scorer, cognitive debt or drift lens to inspect another view; unavailable scores use hatching. Hover or focus a file for all scores, its last quiz and your latest explain-back. The file selector also supports keyboard inspection and empty files. The page follows your system's light/dark preference.

The generated HTML includes its status data and loads pinned d3 **7.9.0** from cdnjs. Rendering requires CDN access; file selection and details remain available if d3 cannot load. It is a snapshot: regenerate after code or evidence changes. The map includes learner email and explain-back text, so review it before sharing.

## Learn while agents work

Run `/keepup on` in another Claude Code terminal for an interactive learning session about files currently in play. The skill offers one walkthrough, paragraph, due delayed check or one-line change summary according to your evidence, then waits. Reply “got it”, “skip” or “next” for another item, “kata” to switch to an exercise, or “stop” to end the session. The session does not install a hook or run a background watcher. Only delivered cards and actual quizzes grant exposure; acknowledgements do not grant accuracy. A kata handoff rechecks cleanliness and cannot start on an agent's uncommitted target.

```sh
node ~/.claude/skills/keepup/scripts/keepup.mjs in-play
```

`in-play` returns JSON `{files, warnings}` without writing learning events or status history. It combines scoped tracked files with unstaged/staged changes and paths changed in **every commit since the current learner's latest event commit**, including intervening changes later reverted. Renames use current scoped paths; deleted and excluded files are omitted. Another learner's events do not move the boundary.

Without a prior event, or when that event's commit is unavailable or no longer an ancestor of HEAD, it explicitly warns and uses the most recent **20 commits**, plus working changes. Before the first commit it reports tracked working/staged changes only. If nothing is in play, the teaching workflow falls back to the debt ranking. No file selection writes evidence.

## Existing cogdebt projects

The skill is now named `keepup`. New projects use `.keepup/`; projects with an existing `.cogdebt/` keep using that directory, preserving events, snapshots, configuration and scorers. Use the `state` path returned by CLI `init` for those projects instead of assuming `.keepup/`. Neither folder is included in learning targets. If both exist, the CLI stops before changing state so you can choose which history to use.

Scorers receive `KEEPUP_STATE` and `KEEPUP_LEARNER`, along with the old `COGDEBT_STATE` and `COGDEBT_LEARNER` aliases. `KEEPUP_NOW` takes precedence over the legacy `COGDEBT_NOW` test clock. Stored event types and response values are unchanged, including the response word `next`.
