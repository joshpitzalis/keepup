import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "./fixtures.ts";

const cli = fileURLToPath(
  new URL("../../keepup/scripts/keepup.mjs", import.meta.url)
);

function architecture(root: string, ...args: string[]): { path: string } {
  const result = spawnSync(process.execPath, [cli, "architecture", ...args], {
    cwd: root,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

function report(root: string, id: string, rating: number | null): void {
  architecture(
    root,
    "record",
    JSON.stringify({
      dimension: "interface-leverage",
      evidence: ["src/module.ts", "src/caller.ts"],
      exclusions: [],
      id,
      limitations: rating === null ? ["Scenario evidence is incomplete"] : [],
      module: {
        id: "labels",
        interface: ["src/module.ts"],
        members: ["src/module.ts"],
      },
      review: {
        confidence: "medium",
        notes: "Reviewed against caller evidence",
        reviewer: "Learner",
        status: "reviewed",
      },
      scenarios: [
        {
          description: "Read </script><script>alert(1)</script> label",
          evidence: ["src/caller.ts"],
          id: "read-label",
          obligations: [],
          rating,
          rationale: "Caller expresses intent through the public interface",
        },
      ],
    })
  );
  const result = architecture(root, "report", id, "--no-open");
  copyFileSync(result.path, join(root, "report.html"));
}

test("reviewed facts and escaped evidence remain readable without JavaScript", async ({
  page,
  reportRoot,
}, testInfo) => {
  report(reportRoot, "reviewed", 1);
  await page.goto("/report.html");
  await expect(
    page.getByRole("heading", { name: /architecture/iu })
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText(
    "Read </script><script>alert(1)</script> label"
  );
  await expect(page.getByRole("main")).toContainText("interface-leverage");

  const inspection = page.getByText(
    "Inspect captured evidence and provenance",
    { exact: true }
  );

  await page.keyboard.press("Tab");
  await expect(inspection).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/"schemaVersion": 1/u)).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("desktop.png"),
  });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("phone.png"),
  });
});

test("missing evidence and source drift remain visible", async ({
  page,
  reportRoot,
}) => {
  report(reportRoot, "unknown", null);
  writeFileSync(join(reportRoot, "src/caller.ts"), "// caller changed\n");
  const result = architecture(reportRoot, "report", "unknown", "--no-open");
  copyFileSync(result.path, join(reportRoot, "report.html"));
  await page.goto("/report.html");
  await expect(page.getByRole("main")).toContainText("unavailable");
  await expect(page.getByRole("main")).toContainText("stale");
});
