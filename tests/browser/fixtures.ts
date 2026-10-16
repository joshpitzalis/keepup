import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { test as base } from "@playwright/test";

const cli = fileURLToPath(
  new URL("../../keepup/scripts/keepup.mjs", import.meta.url)
);

function command(root: string, executable: string, args: string[]): string {
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr);

  return result.stdout;
}

export const test = base.extend<{ reportRoot: string }>({
  baseURL: async ({ reportRoot }, use) => {
    const server = createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(readFileSync(join(reportRoot, "report.html")));
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Node also exposes string addresses for Unix sockets.
    assert.ok(address && typeof address !== "string");

    try {
      await use(`http://127.0.0.1:${address.port}`);
    } finally {
      await promisify(server.close.bind(server))();
    }
  },
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures without dependencies still require this binding.
  reportRoot: async ({}, use) => {
    const root = mkdtempSync(join(tmpdir(), "keepup-browser-"));

    try {
      command(root, "git", ["init", "-q"]);
      command(root, "git", ["config", "user.email", "learner@example.com"]);
      command(root, "git", ["config", "user.name", "Learner"]);
      mkdirSync(join(root, "src"));
      writeFileSync(
        join(root, "src/module.ts"),
        'export const label = "</script><script>alert(1)</script>";\n'
      );
      writeFileSync(
        join(root, "src/caller.ts"),
        'import { label } from "./module.ts";\n'
      );
      command(root, "git", ["add", "."]);
      command(root, "git", ["commit", "-qm", "fixture"]);
      command(root, process.execPath, [cli, "init"]);
      await use(root);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  },
});

export { expect } from "@playwright/test";
