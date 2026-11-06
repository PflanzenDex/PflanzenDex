// One ESLint pass for the three checks that count ESLint findings with their baseline allowance switched off:
// baseline (code metrics, FR-QG-17), constants (FR-QG-12) and ui-text (FR-QG-26). Each check needs its findings with
// its switch off (QUALITY_BASELINE, CONSTANTS_BASELINE, UI_TEXT_BASELINE, see app/eslint.config.js). A rule depends
// only on its own switch, so one pass with all three off gives each check what it would get alone (US-QG-01).
// `make gates` runs that pass once as step eslint-shared (eslint-shared-run.mjs) and names its file in
// GATES_ESLINT_RESULTS; the checks read that file. Run alone (`npm run baseline`), a check runs the pass itself.
// `lint` does not share the pass: it keeps the allowances on, so its findings differ in baselined files.
import fs from "node:fs";
import path from "node:path";

export const RESULTS_ENV = "GATES_ESLINT_RESULTS";
const SWITCHES = ["QUALITY_BASELINE", "CONSTANTS_BASELINE", "UI_TEXT_BASELINE"];

// Whether a file (relative to app/) lies under one of `dirs`; "." stands for the whole app.
export const inDirs = (file, dirs) =>
  dirs.some((dir) => dir === "." || file === dir || file.startsWith(`${dir}/`));

// ESLint with the baseline switches off. Returns [{ file, messages: [{ ruleId, message, line }] }] for the files under
// `dirs` that have a message of one of `rules`; a file without such a message is left out.
export async function lintWithoutBaselines(dirs, rules) {
  for (const name of SWITCHES) process.env[name] = "off";
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({ ruleFilter: ({ ruleId }) => rules.includes(ruleId) });
  const results = await eslint.lintFiles(dirs);
  return results
    .map((result) => ({
      file: path.relative(process.cwd(), result.filePath).split(path.sep).join("/"),
      messages: result.messages
        .filter((m) => rules.includes(m.ruleId))
        .map(({ ruleId, message, line }) => ({ ruleId, message, line })),
    }))
    .filter((result) => result.messages.length > 0);
}

// The findings of a shared pass (`data` as eslint-shared-run.mjs writes it) for the files under `dirs` and the rules
// in `rules`. A rule the pass did not run is an error: an empty list would let the check pass without looking.
export function sharedFindings(data, { dirs, rules }) {
  const missing = rules.filter((rule) => !data.rules.includes(rule));
  if (missing.length > 0)
    throw new Error(`the shared ESLint pass did not run: ${missing.join(", ")}`);
  return data.files
    .filter((result) => inDirs(result.file, dirs))
    .map((result) => ({
      file: result.file,
      messages: result.messages.filter((m) => rules.includes(m.ruleId)),
    }))
    .filter((result) => result.messages.length > 0);
}

// Findings for one check: from the shared pass when GATES_ESLINT_RESULTS names its file, else from an own ESLint run.
// A named file that is missing or unreadable is an error, never an empty result.
export async function lintFindings({ dirs, rules }) {
  const file = process.env[RESULTS_ENV];
  if (file === undefined) return lintWithoutBaselines(dirs, rules);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `${RESULTS_ENV} names ${file}, which the shared ESLint pass did not write (${error.code ?? error.message}). Run make gates.`,
      { cause: error },
    );
  }
  return sharedFindings(data, { dirs, rules });
}
