// Shared coverage settings for all vitest configs. Thresholds live only in coverage-thresholds.json.
import fs from "node:fs";

const file = new URL("../../../../coverage-thresholds.json", import.meta.url);

export function readThresholds() {
  return JSON.parse(fs.readFileSync(file, "utf8")).packages;
}

/** Vitest `test.coverage` block for one package. Unmeasured packages (null) get no thresholds. */
export function coverageFor(pkg) {
  const thresholds = readThresholds()[pkg] ?? undefined;
  return {
    provider: "v8",
    reporter: ["text-summary", "json-summary", "json", "lcov"],
    reportsDirectory: "coverage",
    include: ["src/**/*.{ts,tsx}"],
    exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "src/main.ts", "src/main.tsx"],
    ...(thresholds ? { thresholds } : {}),
  };
}
