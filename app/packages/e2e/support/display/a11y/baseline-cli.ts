/* eslint-disable security/detect-non-literal-fs-filename -- the one argument is the results file the caller names */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCREENS } from "../one-screen/register";
import { A11Y_SIZES, buildBaseline, type Result } from "./findings";
import { BASELINE_FILE, writeBaseline } from "./reporter";

// `npm run a11y-routes:baseline -- <results.json>` (issue 467): rebuilds the baseline of the accessibility gate from the
// results.json of a full run, for example the artifact "a11y-routes-report" of the CI job. CI data differs from a local
// database, so this is how the checked-in baseline is made. A partial file is refused.

const file = process.argv[2];
if (!file) {
  console.error("usage: npm run a11y-routes:baseline -- <path/to/results.json>");
  process.exit(1);
}
const results = JSON.parse(
  readFileSync(resolve(process.env["INIT_CWD"] ?? ".", file), "utf8"),
) as Result[];
const expected = SCREENS.length * A11Y_SIZES.length;
if (results.length !== expected) {
  console.error(
    `${file} holds ${results.length} measurements, a full run has ${expected}: baseline not written`,
  );
  process.exit(1);
}
const baseline = buildBaseline(results);
writeBaseline(baseline);
console.log(`baseline written: ${baseline.entries.length} entries (${BASELINE_FILE.pathname})`);
