#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Lizard CSV has no header; quoted function names may contain commas and quotes.
function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"' && quoted && text[index + 1] === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" && !quoted) {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (quoted) {
    throw new Error("Unterminated lizard CSV quote");
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

try {
  const files = readFileSync(0, "utf-8").split(/\r?\n/u).filter(Boolean);

  if (!files.length) {
    process.exit(0);
  }

  const absolute = new Map(files.map((file) => [resolve(file), file]));

  const result = spawnSync(
    "uvx",
    ["lizard", "--csv", "-i", "-1", ...absolute.keys()],
    { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024, timeout: 110_000 }
  );

  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message ||
        result.stderr.trim() ||
        `lizard exit ${result.status}`
    );
  }

  const worst = new Map<
    string,
    {
      file: string;
      metric: string;
      value: number;
      raw: number;
      line: number;
      fn: string;
    }
  >();

  for (const row of csvRows(result.stdout)) {
    if (row.length !== 11 || row[6] === undefined || row[7] === undefined) {
      throw new Error("Invalid lizard CSV columns");
    }

    const file = absolute.get(resolve(row[6]));
    const ccn = Number(row[1]);
    const line = Number(row[9]);

    if (
      !file ||
      !Number.isFinite(ccn) ||
      ccn < 1 ||
      !Number.isInteger(line) ||
      line < 1
    ) {
      throw new Error("Invalid lizard CSV values");
    }

    if (ccn > (worst.get(file)?.raw ?? -Infinity)) {
      worst.set(file, {
        file,
        fn: row[7],
        line,
        metric: "complexity",
        raw: ccn,
        value: Math.min(1, 5 / ccn),
      });
    }
  }

  for (const report of worst.values()) {
    console.log(JSON.stringify(report));
  }

  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
