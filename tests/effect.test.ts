import assert from "node:assert/strict";
import test from "node:test";

import { Effect } from "effect";

test("Effect is available for TypeScript refactors", async () => {
  const program: Effect.Effect<number> = Effect.succeed(42);
  assert.equal(await Effect.runPromise(program), 42);
});
