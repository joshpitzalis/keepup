import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  env: { browser: false, node: true },
  extends: [core],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    ".keepup/**",
    ".cogdebt/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    {
      name: "anti-slop-effect",
      specifier: "./tools/oxlint/anti-slop/effect/index.ts",
    },
  ],
  overrides: [
    {
      // These functions are the parsers: they must inspect untrusted input before branding it.
      files: [
        "keepup/scripts/handlers/helpers.ts",
        "keepup/scripts/handlers/parse-event.ts",
      ],
      rules: {
        "anti-slop/no-object-parameters": "off",
        "anti-slop/no-runtime-typeof": "off",
        "anti-slop/no-unknown-parameters": "off",
        "anti-slop/no-unsafe-dictionary-type": "off",
      },
    },
    {
      // Public overloads preserve each stage's type; only the pipe implementation erases it.
      files: ["keepup/scripts/handlers/utils.ts"],
      rules: {
        "anti-slop/no-unknown-parameters": "off",
        "anti-slop/no-unknown-returns": "off",
      },
    },
    {
      // CLI tests deliberately submit malformed JSON values to exercise rejection.
      files: ["keepup/__tests__/*.test.ts"],
      rules: { "anti-slop/no-unknown-parameters": "off" },
    },
  ],
  rules: {
    "anti-slop-effect/no-manual-effect-error-tag": "error",
    "anti-slop-effect/no-manual-tag-comparison": "error",
    "anti-slop-effect/no-manual-tagged-construction": "error",
    "anti-slop-effect/no-service-constructor-imports": "error",
    "anti-slop-effect/prefer-effect-match": "error",
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    // Preserve hoisted functions and locally scoped helpers used throughout this CLI.
    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    // POSIX file permissions require bit masks.
    "no-bitwise": ["error", { allow: ["&"] }],
    "no-use-before-define": ["error", { functions: false }],
    "oxc/no-accumulating-spread": "error",
    "unicorn/consistent-function-scoping": "off",
    "unicorn/import-style": [
      "error",
      { styles: { "node:path": { named: true } } },
    ],
  },
});
