// Shared coverage settings for all vitest configs. Thresholds live only in coverage-thresholds.json.
import fs from "node:fs";

const file = new URL("../../../../config/gates/coverage-thresholds.json", import.meta.url);

export function readThresholds() {
  return JSON.parse(fs.readFileSync(file, "utf8")).packages;
}

// The packages whose tests did not run in this CI run (US-QG-02). The results job of ci.yml sets it to `web` only when the web
// tests were skipped for a change without UI; the ratchet and the CRAP check then leave that package out and judge the others.
export const UNMEASURED_ENV = "COVERAGE_UNMEASURED";

/** The package names of the value (comma-separated, e.g. `web`). An unknown name throws, so a typo never leaves a package out. */
export function unmeasuredFrom(value, known = Object.keys(readThresholds())) {
  const names = String(value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = names.filter((name) => !known.includes(name));
  if (unknown.length)
    throw new Error(
      `${UNMEASURED_ENV} names an unknown package: ${unknown.join(", ")} (known: ${known.join(", ")})`,
    );
  return names;
}

/** Vitest `test.coverage` block for one package. Unmeasured packages (null) get no thresholds. */
export function coverageFor(pkg) {
  const thresholds = readThresholds()[pkg] ?? undefined;
  return {
    provider: "v8",
    reporter: ["text-summary", "json-summary", "json", "lcov"],
    reportsDirectory: "coverage",
    include: ["src/**/*.{ts,tsx}"],
    exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "src/main.ts", "src/app/main.tsx"],
    ...(thresholds ? { thresholds } : {}),
  };
}
