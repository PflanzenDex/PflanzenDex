import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import fs from "node:fs";
import { walkCode, hasMarker } from "./scripts/check-boundaries.mjs";

// Dateien mit `MAX_LINES_IGNORE: <Grund>` in den ersten 5 Zeilen sind von max-lines ausgenommen (US-QG-03).
const maxLinesIgnored = walkCode("packages")
  .filter((f) => hasMarker(fs.readFileSync(f, "utf8"), "MAX_LINES_IGNORE"))
  .map((f) => f.split("\\").join("/"));

// Schwellen (Startwerte, Annahme; E-15): Dateilänge ≤ 200, Komplexität ≤ 15, in `core` ≤ 10.
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
