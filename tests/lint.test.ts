import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("Oxlint loads Ultracite and both anti-slop rule groups", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "keepup-lint-"));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const fixture = join(directory, "fixture.ts");

  const binary = fileURLToPath(
    new URL("../node_modules/oxlint/bin/oxlint", import.meta.url)
  );

  const config = fileURLToPath(new URL("../oxlint.config.ts", import.meta.url));

  const lint = () =>
    spawnSync(process.execPath, [binary, "--config", config, fixture], {
      encoding: "utf-8",
    });

  writeFileSync(fixture, "export const answer = 42;\n");
  const valid = lint();
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);

  writeFileSync(
    fixture,
    `
export const read = () => Reflect.get({ answer: 42 }, "answer");

export const ready = { _tag: "Ready" };

export function accept(value: unknown) {
  return value;
}

export const pause = () => { debugger; };
`
  );
  const invalid = lint();
  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout, /anti-slop\(no-reflect-get\)/u);
  assert.match(invalid.stdout, /anti-slop\(no-unknown-parameters\)/u);
  assert.match(
    invalid.stdout,
    /anti-slop-effect\(no-manual-tagged-construction\)/u
  );
  assert.match(invalid.stdout, /no-debugger/u);
});
