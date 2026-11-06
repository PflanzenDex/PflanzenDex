// Step eslint-shared of `make gates` (US-QG-01): one ESLint pass with the baseline switches off, for baseline,
// constants and ui-text. It writes the findings to the file named by GATES_ESLINT_RESULTS. It fails only when ESLint
// cannot run; the three checks decide on the findings.
import fs from "node:fs";
import { METRIC_RULES } from "./check-baseline.mjs";
import { RULES as CONSTANT_RULES } from "../../code/constants/check-constants.mjs";
import { RULE as UI_TEXT_RULE } from "../../code/ui-text/check-ui-text.mjs";
import { RESULTS_ENV, lintWithoutBaselines } from "./eslint-shared.mjs";

const file = process.env[RESULTS_ENV];
if (!file) {
  console.error(`eslint-shared: ${RESULTS_ENV} must name the file to write; make gates sets it`);
  process.exit(2);
}
const rules = [...METRIC_RULES, ...Object.values(CONSTANT_RULES), UI_TEXT_RULE];
const files = await lintWithoutBaselines(["."], rules);
fs.writeFileSync(file, `${JSON.stringify({ rules, files })}\n`);
const count = files.reduce((sum, result) => sum + result.messages.length, 0);
console.log(
  `eslint-shared: ${count} finding(s) in ${files.length} file(s) for baseline, constants and ui-text`,
);
