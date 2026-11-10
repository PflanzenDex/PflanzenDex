// One ESLint pass for the three checks that count ESLint findings with their baseline allowance switched off:
// baseline (code metrics, FR-QG-17), constants (FR-QG-12) and ui-text (FR-QG-26). Each check needs its findings with
// its switch off (QUALITY_BASELINE, CONSTANTS_BASELINE, UI_TEXT_BASELINE, see app/eslint.config.js). A rule depends
// only on its own switch, so one pass with all three off gives each check what it would get alone (US-QG-01).
// `make gates` runs that pass once as step eslint-shared (eslint-shared-run.mjs) and names its file in
// GATES_ESLINT_RESULTS; the checks read that file. Run alone (`npm run baseline`), a check runs the pass itself.
// `lint` does not share the pass: it keeps the allowances on, so its findings differ in baselined files.
// Both use an ESLint cache whose file name is a key over every input of a result that ESLint's own cache does not see
// (eslintCacheFile, issue 1608). The shared pass and each check that runs alone have a cache file of their own per rule
// set (issue 1685): ESLint's cache does not see the rule filter, so a run with other rules must not answer from it.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const APP_DIR = fileURLToPath(new URL("../../../../", import.meta.url));
export const RESULTS_ENV = "GATES_ESLINT_RESULTS";
const SWITCHES = ["QUALITY_BASELINE", "CONSTANTS_BASELINE", "UI_TEXT_BASELINE"];

// What a result depends on beyond the file itself (issue 1608): the config and the locked dependencies, the rule code, the
// rule filter of the shared pass (the gates folder), the source of core, which the constants rule reads when it loads
// (eslint-constants.mjs), and config/gates: eslint.config.js reads the baselines and quality limits from there when it
// loads. Every one of them is keyed here by its own content, so the key does not wait for ESLint's config hash to notice
// a change. ESLint's own cache sees none of these, so a change in one of them must change the key.
const KEY_FILES = ["eslint.config.js", "package-lock.json"];
const KEY_DIRS = [
  "tools/check/code",
  "tools/check/quality/gates",
  "config/lint",
  "config/gates",
  "packages/core/src",
];
// A cache file name after its kind prefix: the key, and for a shared file the digest of its rule set (rulesDigest).
const CACHE_NAME = /^([0-9a-f]{64})(?:\.json|-[0-9a-f]{16}\.json)$/;

// Whether a file (relative to app/) lies under one of `dirs`; "." stands for the whole app.
export const inDirs = (file, dirs) =>
  dirs.some((dir) => dir === "." || file === dir || file.startsWith(`${dir}/`));

// ESLint with the baseline switches off. Returns [{ file, messages: [{ ruleId, message, line }] }] for the files under
// `dirs` that have a message of one of `rules`; a file without such a message is left out.
export async function lintWithoutBaselines(dirs, rules) {
  for (const name of SWITCHES) process.env[name] = "off";
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({
    ruleFilter: ({ ruleId }) => rules.includes(ruleId),
    cache: true,
    cacheStrategy: "content",
    cacheLocation: path.join(APP_DIR, eslintCacheFile("shared", APP_DIR, rules)),
  });
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

// SHA-256 over the names and contents of the keyed files (issue 1608): a change in one of them changes the key.
export function eslintCacheKey(appDir = APP_DIR) {
  const names = [...KEY_FILES];
  for (const dir of KEY_DIRS)
    for (const name of fs.readdirSync(path.join(appDir, dir), { recursive: true }))
      if (fs.statSync(path.join(appDir, dir, name)).isFile()) names.push(`${dir}/${name}`);
  const hash = createHash("sha256");
  for (const name of names.sort())
    hash
      .update(`${name}\0`)
      .update(fs.readFileSync(path.join(appDir, name)))
      .update("\0");
  return hash.digest("hex");
}

// SHA-256 over the sorted, distinct rule ids of a run, cut to 16 hex characters (issue 1685): the rule set that a shared
// cache file belongs to. The order of the ids does not matter; a different set of ids does.
export function rulesDigest(rules) {
  return createHash("sha256")
    .update([...new Set(rules)].sort().join("\n"))
    .digest("hex")
    .slice(0, 16);
}

// The ESLint cache file of `kind` ("lint" or "shared"), relative to app/ where the lint runs, named by the key:
// `.cache/gates/eslint-lint-<key>.json`, and `.cache/gates/eslint-shared-<key>-<rules>.json` for the shared kind, where
// <rules> is rulesDigest(rules) (issue 1685). ESLint's cache does not see the rule filter, so every rule set has a file of
// its own. The folder keeps the files of the current key, whatever their rule set, and removes the files of an older key.
export function eslintCacheFile(kind, appDir = APP_DIR, rules) {
  if (!/^[a-z]+$/.test(kind)) throw new Error(`the ESLint cache kind must be a word, got ${kind}`);
  if (kind === "shared" && rules === undefined)
    throw new Error("a shared ESLint cache file needs the rule set of its run");
  const folder = path.join(appDir, ".cache", "gates");
  const key = eslintCacheKey(appDir);
  const ruleSet = rules === undefined ? "" : `-${rulesDigest(rules)}`;
  const prefix = `eslint-${kind}-`;
  fs.mkdirSync(folder, { recursive: true });
  for (const old of fs.readdirSync(folder)) {
    const match = old.startsWith(prefix) ? CACHE_NAME.exec(old.slice(prefix.length)) : null;
    if (match && match[1] !== key) fs.rmSync(path.join(folder, old), { force: true });
  }
  return `.cache/gates/${prefix}${key}${ruleSet}.json`;
}

// `node eslint-shared.mjs --cache-file <kind>` prints the cache file that the lint script names (issue 1608).
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "--cache-file")
  process.stdout.write(`${eslintCacheFile(process.argv[3])}\n`);
