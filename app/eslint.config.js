import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import fs from "node:fs";
import { walkCode, hasMarker } from "./scripts/check-boundaries.mjs";

// Files with `MAX_LINES_IGNORE: <reason>` in their first 5 lines are exempt from max-lines (US-QG-03).
const maxLinesIgnored = walkCode("packages")
  .filter((f) => hasMarker(fs.readFileSync(f, "utf8"), "MAX_LINES_IGNORE"))
  .map((f) => f.split("\\").join("/"));

// Thresholds (starting values, assumptions; E-15): file length ≤ 200, complexity ≤ 15, in `core` ≤ 10.
export default defineConfig([
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      complexity: ["error", 15],
      "max-lines": ["error", { max: 200 }],
    },
  },
  { files: ["packages/core/**/*.ts"], rules: { complexity: ["error", 10] } },
  { files: ["**/*.test.ts", "**/*.test.tsx", "**/*.test.mjs"], rules: { "max-lines": "off" } },
  ...(maxLinesIgnored.length ? [{ files: maxLinesIgnored, rules: { "max-lines": "off" } }] : []),
]);
