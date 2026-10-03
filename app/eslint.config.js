import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import fs from "node:fs";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";
import { minimatch } from "minimatch";
import { walkCode, hasMarker } from "./scripts/check-boundaries.mjs";

// Thresholds live once in quality-limits.json (FR-QG-16); per-area overrides are merged over `default`.
const limits = JSON.parse(
  fs.readFileSync(new URL("./quality-limits.json", import.meta.url), "utf8"),
);
const rulesFor = (l) => ({
  complexity: ["error", l.complexity],
  "sonarjs/cognitive-complexity": ["error", l.cognitiveComplexity],
  "max-lines": ["error", { max: l.maxLines }],
  "max-lines-per-function": [
    "error",
    { max: l.maxLinesPerFunction, skipBlankLines: true, skipComments: true },
  ],
  "max-depth": ["error", l.maxDepth],
  "max-params": ["error", l.maxParams],
});
const areaOverrides = Object.entries(limits.overrides).map(([glob, o]) => ({
  files: [glob],
  rules: rulesFor({ ...limits.default, ...o }),
}));

// Ratchet baseline (FR-QG-17): known violations may not get worse. A baselined file is allowed up to its recorded
// value per rule; scripts/check-baseline.mjs runs with QUALITY_BASELINE=off and verifies the list is exact.
const baseline =
  process.env.QUALITY_BASELINE === "off"
    ? []
    : JSON.parse(fs.readFileSync(new URL("./quality-baseline.json", import.meta.url), "utf8"))
        .entries;
const baselineOverrides = [...new Set(baseline.map((e) => e.file))].map((file) => {
  const own = baseline.filter((e) => e.file === file);
  const area = areaOverrides.find((a) => minimatch(file, a.files[0]));
  const current = area?.rules ?? rulesFor(limits.default);
  const rules = {};
  for (const rule of new Set(own.map((e) => e.rule))) {
    const value = Math.max(...own.filter((e) => e.rule === rule).map((e) => e.value));
    rules[rule] = [
      "error",
      rule === "max-lines-per-function" ? { ...current[rule][1], max: value } : value,
    ];
  }
  return { files: [file], rules };
});

// Files with `COMPLEXITY_IGNORE: <reason>` in the first 5 lines are exempt from the function metric rules (US-QG-08).
const complexityIgnored = walkCode("packages")
  .filter((f) => hasMarker(fs.readFileSync(f, "utf8"), "COMPLEXITY_IGNORE"))
  .map((f) => f.split("\\").join("/"));

// Dateien mit `MAX_LINES_IGNORE: <Grund>` in den ersten 5 Zeilen sind von max-lines ausgenommen (US-QG-03).
const maxLinesIgnored = walkCode("packages")
  .filter((f) => hasMarker(fs.readFileSync(f, "utf8"), "MAX_LINES_IGNORE"))
  .map((f) => f.split("\\").join("/"));

// Local-date handling (NFR-08): UTC slicing of ISO strings yields the wrong day around midnight (US-QG-05, D4/B-01).
const utcDateSlice = (method, args) =>
  `CallExpression[callee.property.name='${method}'][callee.object.callee.property.name='toISOString']${args}`;
const noUtcDateSlice = ["slice", "substring", "substr"].map((m) => ({
  selector: utcDateSlice(m, "[arguments.0.value=0][arguments.1.value=10]"),
  message:
    "Do not derive a calendar date via toISOString().slice(0, 10): that is the UTC day. Use the local-date helpers (NFR-08).",
}));

export default defineConfig([
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/.lighthouseci/**"] },
  js.configs.recommended,
  tseslint.configs.strict,
  // QG-S3: security rules at error level. detect-object-injection is off: it flags every `obj[key]` and is
  // known for false positives in typed code (E-16: revisit with Semgrep after R1).
  {
    ...security.configs.recommended,
    rules: {
      ...Object.fromEntries(
        Object.keys(security.configs.recommended.rules).map((r) => [r, "error"]),
      ),
      "security/detect-object-injection": "off",
    },
  },
  // Scripts and tests build file paths from trusted constants and temp dirs.
  {
    files: ["scripts/**", "eslint.config.js", "**/*.test.ts", "**/*.test.mjs"],
    rules: { "security/detect-non-literal-fs-filename": "off" },
  },
  {
    plugins: { sonarjs },
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { ...rulesFor(limits.default), "no-restricted-syntax": ["error", ...noUtcDateSlice] },
  },
  ...areaOverrides,
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.test.mjs"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "max-params": "off",
      "sonarjs/cognitive-complexity": "off",
    },
  },
  ...baselineOverrides,
  ...(maxLinesIgnored.length ? [{ files: maxLinesIgnored, rules: { "max-lines": "off" } }] : []),
  ...(complexityIgnored.length
    ? [
        {
          files: complexityIgnored,
          rules: {
            complexity: "off",
            "sonarjs/cognitive-complexity": "off",
            "max-lines-per-function": "off",
            "max-depth": "off",
            "max-params": "off",
          },
        },
      ]
    : []),
]);
