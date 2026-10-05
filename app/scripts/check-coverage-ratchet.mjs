// Coverage ratchet (US-QG-06, E-15): fails if a measured value drops below its threshold.
// Prints a hint (no failure) when a value is at least RAISE_HINT_GAP points above its threshold.
// Never changes thresholds; raising them is a manual edit of coverage-thresholds.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODULE_CONFIG } from "../modules.config.mjs";
import { coverageByModule } from "./module-report.mjs";

export const METRICS = ["lines", "branches", "functions", "statements"];
export const RAISE_HINT_GAP = 2;

/**
 * @param {Record<string, Record<string, number> | null>} thresholds per package, null = not measured yet
 * @param {Record<string, Record<string, {pct: number}> | null>} measured per package summary.total, null = missing
 * @returns {{failures: string[], hints: string[], notes: string[]}}
 */
export function compare(thresholds, measured) {
  const failures = [];
  const hints = [];
  const notes = [];
  for (const [pkg, limits] of Object.entries(thresholds)) {
    if (!limits) {
      notes.push(`${pkg}: no thresholds yet (not measured); set them from the first CI run`);
      continue;
    }
    const total = measured[pkg];
    if (!total) {
      failures.push(`${pkg}: no coverage summary found (run the tests with coverage first)`);
      continue;
    }
    for (const metric of METRICS) {
      const limit = limits[metric];
      const pct = total[metric]?.pct;
      if (typeof pct !== "number") {
        failures.push(`${pkg}: ${metric} missing in the coverage summary`);
      } else if (pct < limit) {
        failures.push(`${pkg}: ${metric} ${pct}% is below the threshold ${limit}%`);
      } else if (pct - limit >= RAISE_HINT_GAP) {
        hints.push(
          `${pkg}: ${metric} is ${pct}%, raise the threshold ${limit} to ${Math.floor(pct)}`,
        );
      }
    }
  }
  return { failures, hints, notes };
}

export function loadMeasured(root, packages) {
  const measured = {};
  for (const pkg of packages) {
    const file = path.join(root, "packages", pkg, "coverage", "coverage-summary.json");
    measured[pkg] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).total : null;
  }
  return measured;
}

function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { packages } = JSON.parse(
    fs.readFileSync(path.join(root, "coverage-thresholds.json"), "utf8"),
  );
  const { failures, hints, notes } = compare(packages, loadMeasured(root, Object.keys(packages)));
  const summaries = {};
  for (const pkg of Object.keys(packages)) {
    const file = path.join(root, "packages", pkg, "coverage", "coverage-summary.json");
    if (fs.existsSync(file)) summaries[pkg] = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const perModule = coverageByModule(summaries, MODULE_CONFIG.MODULES);
  if (perModule.length)
    console.log(
      `note: line coverage per module (report only): ${perModule.map((m) => `${m.name} ${m.lines}%`).join(", ")}`,
    );
  for (const line of notes) console.log(`note: ${line}`);
  for (const line of hints) console.log(`hint: ${line}`);
  for (const line of failures) console.error(`FAIL: ${line}`);
  if (failures.length) process.exit(1);
  console.log("coverage ratchet: ok");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
