/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- The analyser process and compiler AST are explicit trust boundaries. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

import type { ManifestEntry } from "./domain.ts";
import { object, strings, text } from "./parse-common.ts";
import type { AnalyserTool, DependencyEdge } from "./seam-domain.ts";

const VERSION = "dependency-cruiser@18.6.0/typescript@5.9.3";
const CONFIG = join(import.meta.dirname, "dependency-cruiser.json");

function digest(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toolFiles(directory: string, root = directory): ManifestEntry[] {
  return readdirSync(directory, { withFileTypes: true })
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);

      if (
        entry.isSymbolicLink() &&
        !relative(root, path).split("/").includes(".bin")
      ) {
        throw new Error(
          "Symlinked analyser packages are unsupported; use documented npm prerequisite layout"
        );
      }

      if (entry.isDirectory()) {
        return toolFiles(path, root);
      }

      if (!entry.isFile() || !/\.(?:[cm]?js|json)$/u.test(entry.name)) {
        return [];
      }

      return [{ hash: digest(readFileSync(path)), path: relative(root, path) }];
    });
}

export function analyserTool(directory: string): AnalyserTool {
  const root = realpathSync(directory);

  for (const [name, version] of [
    ["dependency-cruiser", "18.6.0"],
    ["typescript", "5.9.3"],
  ]) {
    const info = object(
      JSON.parse(
        readFileSync(
          join(root, "node_modules", name ?? "", "package.json"),
          "utf-8"
        )
      )
    );

    if (info.version !== version) {
      throw new Error(
        `Required ${name}@${version}; install pinned analyser prerequisite`
      );
    }
  }

  const assets = toolFiles(join(root, "node_modules"), root);

  for (const name of ["package.json", "package-lock.json"]) {
    if (existsSync(join(root, name))) {
      assets.push({ hash: digest(readFileSync(join(root, name))), path: name });
    }
  }

  return {
    assets,
    directory: root,
    fingerprint: digest(JSON.stringify(assets)),
    version: VERSION,
  };
}

export function analyserToolChanged(tool: AnalyserTool): boolean {
  try {
    return analyserTool(tool.directory).fingerprint !== tool.fingerprint;
  } catch {
    return true;
  }
}

interface SourceImport {
  readonly specifier: string | null;
  readonly line: number;
}

interface SyntaxInventory {
  readonly imports: ReadonlyMap<string, readonly SourceImport[]>;
  readonly limitations: readonly string[];
}

interface CompilerNode {
  readonly kind: number;
  readonly expression?: CompilerNode;
  readonly text?: string;
  readonly moduleSpecifier?: CompilerNode;
  readonly arguments?: readonly CompilerNode[];
  readonly getStart: (source: CompilerNode) => number;
}

interface CompilerSource extends CompilerNode {
  readonly getLineAndCharacterOfPosition: (position: number) => {
    readonly line: number;
  };
}

// Pinned compiler API stays explicit because repository TypeScript 7 has no compiler API.
interface CompilerApi {
  readonly ScriptTarget: { readonly Latest: number };
  readonly SyntaxKind: { readonly ImportKeyword: number };
  readonly createSourceFile: (
    file: string,
    source: string,
    target: number,
    parents: boolean
  ) => CompilerSource;
  readonly transpileModule: (
    source: string,
    options: { readonly fileName: string; readonly reportDiagnostics: true }
  ) => { readonly diagnostics?: readonly { readonly category: number }[] };
  readonly isImportDeclaration: (node: CompilerNode) => boolean;
  readonly isExportDeclaration: (node: CompilerNode) => boolean;
  readonly isCallExpression: (node: CompilerNode) => boolean;
  readonly isIdentifier: (node: CompilerNode) => boolean;
  readonly isStringLiteralLike: (node: CompilerNode) => boolean;
  readonly forEachChild: (
    node: CompilerNode,
    visit: (child: CompilerNode) => void
  ) => void;
}

function sourceImports(
  compiler: CompilerApi,
  root: string,
  file: string
): readonly SourceImport[] {
  const bytes = readFileSync(join(root, file), "utf-8");

  if (
    !/\.d\.[cm]?ts$/u.test(file) &&
    compiler
      .transpileModule(bytes, { fileName: file, reportDiagnostics: true })
      .diagnostics?.some((diagnostic) => diagnostic.category === 1)
  ) {
    throw new Error(`Unsupported or malformed source syntax: ${file}`);
  }

  const source = compiler.createSourceFile(
    file,
    bytes,
    compiler.ScriptTarget.Latest,
    true
  );

  const imports: SourceImport[] = [];

  function visit(node: CompilerNode): void {
    let specifier: CompilerNode | undefined;

    if (compiler.isImportDeclaration(node)) {
      specifier = node.moduleSpecifier;
    }

    if (compiler.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
    }

    if (
      compiler.isCallExpression(node) &&
      (node.expression?.kind === compiler.SyntaxKind.ImportKeyword ||
        (node.expression &&
          compiler.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      specifier = node.arguments?.[0];
    }

    if (specifier) {
      imports.push({
        line:
          source.getLineAndCharacterOfPosition(specifier.getStart(source))
            .line + 1,
        specifier: compiler.isStringLiteralLike(specifier)
          ? (specifier.text ?? null)
          : null,
      });
    }

    compiler.forEachChild(node, visit);
  }

  visit(source);

  return imports;
}

function syntaxInventory(
  tool: AnalyserTool,
  root: string,
  members: readonly string[]
): SyntaxInventory {
  const require = createRequire(join(tool.directory, "package.json"));
  const compiler: CompilerApi = require("typescript");

  const imports = new Map(
    members.map((file) => [file, sourceImports(compiler, root, file)])
  );

  return {
    imports,
    limitations: [...imports].flatMap(([file, entries]) =>
      entries
        .filter((entry) => entry.specifier === null)
        .map(
          (entry) =>
            `Opaque dynamic dependency at ${file}:${entry.line}; destination unavailable`
        )
    ),
  };
}

interface AcquiredGraph {
  readonly edges: readonly DependencyEdge[];
  readonly analysedFiles: readonly string[];
  readonly limitations: readonly string[];
}

function dependencyKind(
  edge: Record<string, unknown>,
  types: readonly string[]
): DependencyEdge["kind"] {
  if (edge.couldNotResolve) {
    return "unresolved";
  }

  if (types.some((type) => type === "core" || type.startsWith("npm"))) {
    return "external";
  }

  return types.includes("type-only") || edge.preCompilationOnly
    ? "type-only"
    : "runtime";
}

function requireStaticImports(
  edges: readonly DependencyEdge[],
  syntax: SyntaxInventory
): void {
  for (const [file, entries] of syntax.imports) {
    for (const entry of entries) {
      if (
        entry.specifier !== null &&
        !edges.some(
          (edge) =>
            edge.source === file &&
            (edge.specifier === entry.specifier ||
              `node:${edge.specifier}` === entry.specifier)
        )
      ) {
        throw new Error(
          `Dependency analyser omitted static import at ${file}:${entry.line}`
        );
      }
    }
  }
}

function parseGraph(
  value: unknown,
  members: readonly string[],
  syntax: SyntaxInventory
): AcquiredGraph {
  const result = object(value);
  const summary = object(result.summary);
  const environment = object(summary.environment);

  if (
    environment.version !== "18.6.0" ||
    !Array.isArray(result.modules) ||
    !Array.isArray(environment.transpilersFound)
  ) {
    throw new Error("Malformed or unsupported dependency analyser output");
  }

  const compiler = environment.transpilersFound
    .map(object)
    .find((entry) => entry.name === "typescript");

  if (
    compiler?.currentVersion !== "typescript@5.9.3" ||
    compiler.available !== true
  ) {
    throw new Error(
      "Pinned TypeScript compiler unavailable to dependency analyser"
    );
  }

  const modules = result.modules.map(object);

  const analysedFiles = modules
    .map((module) => text(module.source))
    .filter((file) => members.includes(file))
    .toSorted();

  if (members.some((file) => !analysedFiles.includes(file))) {
    throw new Error("Dependency analyser omitted declared source members");
  }

  const edges = modules
    .filter((module) => members.includes(text(module.source)))
    .flatMap((module) => {
      const source = text(module.source);

      if (!Array.isArray(module.dependencies)) {
        throw new TypeError("Malformed analyser dependencies");
      }

      return module.dependencies.map((dependency): DependencyEdge => {
        const edge = object(dependency);
        const types = strings(edge.dependencyTypes);
        const specifier = text(edge.module);

        if (
          typeof edge.couldNotResolve !== "boolean" ||
          typeof edge.dynamic !== "boolean" ||
          typeof edge.preCompilationOnly !== "boolean"
        ) {
          throw new TypeError("Malformed analyser dependency classification");
        }

        const location = syntax.imports
          .get(source)
          ?.find(
            (entry) =>
              entry.specifier === specifier ||
              `node:${entry.specifier}` === specifier ||
              entry.specifier === `node:${specifier}`
          );

        return {
          destination: text(edge.resolved),
          dynamic: edge.dynamic,
          kind: dependencyKind(edge, types),
          line: location?.line ?? null,
          reexport: types.includes("export"),
          source,
          specifier,
        };
      });
    });

  requireStaticImports(edges, syntax);

  const limitations = [...syntax.limitations];

  for (const [file, entries] of syntax.imports) {
    const specifiers = entries.flatMap((entry) =>
      entry.specifier === null ? [] : [entry.specifier]
    );

    if (new Set(specifiers).size < specifiers.length) {
      limitations.push(
        `Multiple import forms in ${file}; analyser merges repeated specifiers, runtime/type/dynamic multiplicity is partial`
      );
    }
  }

  for (const edge of edges) {
    if (edge.kind === "unresolved") {
      limitations.push(
        `Unresolved dependency ${edge.source}:${edge.line ?? "?"} -> ${edge.specifier}`
      );
    }

    if (edge.dynamic) {
      limitations.push(
        `Dynamic dependency ${edge.source}:${edge.line ?? "?"}; only literal destination is resolved`
      );
    }

    if (
      edge.kind !== "external" &&
      edge.kind !== "unresolved" &&
      !members.includes(edge.destination)
    ) {
      limitations.push(
        `Dependency destination outside declared inventory: ${edge.destination}`
      );
    }
  }

  return { analysedFiles, edges, limitations };
}

export function trackedDependencySources(root: string): string[] {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error("Cannot discover tracked dependency sources");
  }

  const files = result.stdout
    .split("\0")
    .filter(
      (file) =>
        /\.(?:[cm]?[jt]sx?)$/u.test(file) &&
        ![".keepup", ".cogdebt", ".git"].includes(file.split("/")[0] ?? "")
    )
    .toSorted();

  for (const file of files) {
    if (
      !existsSync(join(root, file)) ||
      !lstatSync(join(root, file)).isFile()
    ) {
      throw new Error(
        `Tracked dependency source is missing or not a regular file: ${file}`
      );
    }
  }

  return files;
}

export function acquireGraph(
  root: string,
  members: readonly string[],
  tool: AnalyserTool
): AcquiredGraph {
  const executable = join(
    tool.directory,
    "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs"
  );

  if (!existsSync(executable)) {
    throw new Error("Dependency analyser executable missing");
  }

  const timeout = Number(process.env.KEEPUP_ANALYSER_TIMEOUT_MS ?? 30_000);

  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30_000) {
    throw new Error("Analyser timeout must be 1-30000 milliseconds");
  }

  const syntax = syntaxInventory(tool, root, members);

  const result = spawnSync(
    process.execPath,
    [executable, "--config", CONFIG, "--output-type", "json", "--", ...members],
    { cwd: root, encoding: "utf-8", maxBuffer: 16 * 1024 * 1024, timeout }
  );

  if (result.error || result.status !== 0) {
    throw new Error(
      `Dependency analyser unavailable: ${result.error?.message ?? result.stderr.trim()}`
    );
  }

  return parseGraph(JSON.parse(result.stdout), members, syntax);
}
