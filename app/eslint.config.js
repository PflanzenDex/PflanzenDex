import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

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
]);
