import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".keepup/**",
    ".cogdebt/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    "tools/oxlint/anti-slop/**",
    "**/*.md",
  ],
});
