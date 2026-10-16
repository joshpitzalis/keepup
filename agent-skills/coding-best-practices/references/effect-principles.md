# Effect Principles (version-agnostic)

Distilled from kitlangton/skills' Effect v4 guide, keeping only the design discipline that holds on any Effect major version. API names below are concepts — verify the concrete v3 API name and signature via `$effect-ts` and its vendored source before writing code.

## Boundary Discipline

- Keep transport handlers (HTTP, queue consumers, CLI) thin: decode input, read context, call services, map typed errors to transport responses. Business rules live in services/domain functions, never in handlers.
- Wrap HTTP clients, SDKs, CLIs, and external integrations in named effects at adapter boundaries. The adapter owns the full boundary: build request, auth, execute, classify status, decode body, map failures to typed domain errors, apply retry policy.
- Decode unknown input at boundaries with schema decoding into the Effect error channel; reserve throwing construction for trusted internal call sites. Never cast to skip validation.
- Decode persisted rows when values are not trivially trusted.
- Keep provider/network calls outside authoritative database transactions.
- Map infrastructure failures into domain-specific tagged errors at service boundaries; include operation labels (e.g. `"UserRepo.findById"`) in error payloads. Prefer a shared curried error helper (`persistenceError("Op.name")`) over hand-written wrappers per module.

## Error Recovery Discipline

- Catch or retry only when the current boundary has a truthful response. Don't catch to make failures disappear.
- Prefer typed-error recovery (`catchTag` / `catchIf` on expected errors) over cause-level recovery. Cause-level catches belong only at explicit supervision boundaries whose policy really is "log non-interrupt failure and continue".
- Preserve interruption when catching broad causes at ingress/worker/stream boundaries.
- Let exhausted failures remain visible unless the boundary has a real fallback.

## Retry / Scheduling

- Use `Schedule` for retry, repeat, polling, pacing, backoff — never hand-rolled `while (true)` + sleep loops.
- Retry only at the narrowest boundary with proven idempotency.
- Add jitter to backoff to avoid synchronized retry storms; bound every retry policy.
- Polling workers: handle expected typed pass failures (log + ignore) before `repeat`, so defects still surface to supervision.
- Batch workers: isolate expected per-item failures around each item so one bad item doesn't stall the batch — only when skipping/retrying that item is truthful product policy.
- Rate-limited providers: let the schedule take the max of backoff delay and provider `retryAfterMs`.
- `timeout` for real deadlines; `sleep` in production only when sleeping is the domain behavior.

## Services, Layers, Lifecycle

- One service = interface + tag + layer; export only intentional surface, keep row codecs/helpers unexported. No TypeScript `namespace`.
- Layer constructor matches the thing produced: succeed for already-built, sync for lazy, effect for effectful acquisition (the default for real implementations).
- Long-lived work (streams, listeners, workers, forever loops) started by a layer must be forked into the layer scope; layer acquisition must complete. No public `start` methods unless the domain needs manual lifecycle.
- Expensive client acquisition (SDK construction, auth) belongs in the layer, once — never inside per-call lookups or cache lookups.
- `provide` to hide a dependency; `provideMerge` only when the dependency should stay exposed downstream; `mergeAll` for independent exposed layers. Never use merge/provideMerge as blind make-it-compile tools. Prefer flat, topologically sorted runtime layer wiring with named subgraphs.
- Don't hide required authority, credentials, persistence, or transports behind ambient defaults.

## Caching

- Prefer the built-in keyed `Cache` over hand-rolled Map + timestamp + prune loops or in-flight dedupe maps. Concurrent gets for a missing key share one pending lookup — dedupe is built in.
- Cache successes, not transient failures: use exit-aware TTL (zero TTL for failures/degraded fallbacks); bounded negative caching only for stable failures like not-found.
- Build the cache once in the owning layer and share the handle — a cache built per call caches nothing.
- Single value, no key: memoize the effect (`cached` / TTL variant), not a one-key cache.
- Request batching only when the backend has a real batch endpoint; per-item REST endpoints get `forEach` with bounded concurrency + cache, batching buys nothing there.

## Config

- Read runtime config through `Config` recipes in layers, not `process.env` in application logic. Env/`.env` reads are startup/boundary concerns.
- Redacted type for credentials; option type for semantic absence; defaults only for missing data — malformed values still fail.
- Tests override via a test config provider (deterministic values), or provide the app's own config service directly when decoding isn't under test.

## Streams

- Streams are for naturally many-valued, time-ordered sources (events, pagination, queues, file/platform IO) with pull/backpressure/transformation needs. Not for looping forever — one repeated effect with no emitted values is `repeat` + `Schedule`.
- Service interfaces expose `Stream` for consumers; producer queues/refs stay private inside the implementation.
- Queue = each item consumed once; PubSub = every subscriber sees every event; subscription-ref = current value plus changes.
- Long-lived consumers are owned by layers and forked into layer scope.
- Prefer natural backpressure; explicit buffers only to decouple producer/consumer, with a deliberate full-buffer strategy (suspend/dropping/sliding).
- Never `runCollect` unbounded production streams.
- Keyed concurrent work (per session/channel/id, ordered within key, parallel across keys): one named helper built on the fiber-map primitive, not ad hoc fiber bookkeeping scattered through consumers.

## Testing

- Effect-aware tests with explicit layers; live runtime only when real time/services are the behavior under test.
- `TestClock` for anything time-based (sleeps, schedules, retries, timeouts); fork sleeping effects before advancing the clock. No arbitrary real sleeps.
- Synchronization primitives instead of sleeps: one-shot signal = deferred; cross-fiber handoff/observed events = queue; reusable gate = latch; shared observation state = ref.
- First-class test stubs: `TestInterface extends Interface` with control/inspection methods (`sentMessages`, `failNextSend`), one object backing both the real tag and a test tag. Production depends only on the real tag; tests use the test tag.
- Assert the unhappy paths where relevant: typed failures, rollback, interruption, finalization, retry bounds, idempotency, malformed persistence.

## TypeScript

- No `as any`, non-null assertions, or unchecked casts to silence Effect typing problems — fix the design or decode.
