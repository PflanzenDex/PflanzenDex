// US-DEV-06, FR-DEV-07 (#1406): the release notes name the data state of the catalog and the taxonomy tree. The values are
// in the production database, which the release workflow on GitHub cannot reach. The release checklist (step 4c) records
// one reading in DATA_STATE_FILE and merges it into dev before the release PR. semantic-release loads this module as a
// notes plugin (app/config/project/release.config.js) and appends the section of generateNotes to the notes. A missing or
// invalid reading reads "unknown" with its reason: no number is guessed and no release is stopped (P-08, P-10).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_STATE_FILE = "docs/records/data-state.json";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const UTC_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value) => Number.isInteger(value) && value >= 0;
const isStamp = (value) => typeof value === "string" && UTC_STAMP.test(value);
const counted = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Checks the shape of a reading as the query in release-and-rollback.md prints it. */
export function parseDataState(text) {
  let reading;
  try {
    reading = JSON.parse(text);
  } catch {
    return { ok: false, reason: "the record is not valid JSON" };
  }
  if (!isObject(reading) || !isStamp(reading.readAt))
    return { ok: false, reason: "readAt is missing or not a UTC time stamp" };
  if (!isObject(reading.catalog) || !isCount(reading.catalog.approvedSpecies))
    return { ok: false, reason: "catalog.approvedSpecies is missing or not a count" };
  const tree = reading.tree;
  if (tree !== null && (!isObject(tree) || !isStamp(tree.builtAt) || !isCount(tree.species) || !isCount(tree.errors)))
    return { ok: false, reason: "tree is neither null nor a build with builtAt, species and errors" };
  return { ok: true, reading };
}

const readRecord = () => readFileSync(path.join(ROOT, DATA_STATE_FILE), "utf8");

/** The reading of the record; `read` returns its text and is replaced in the tests. */
export function readDataState(read = readRecord) {
  let text;
  try {
    text = read();
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: false, reason: "no reading recorded for this release" };
    return { ok: false, reason: `the record cannot be read (${error?.code ?? "unknown error"})` };
  }
  return parseDataState(text);
}

/** The section of the release notes: a heading and one line for each part (English, like the rest of the notes). */
export function renderDataState(result) {
  if (!result.ok) {
    return [
      "### Data state",
      "",
      `- Catalog: unknown (${result.reason}).`,
      `- Taxonomy tree: unknown (${result.reason}).`,
    ].join("\n");
  }
  const { catalog, readAt, tree } = result.reading;
  const catalogLine = `- Catalog: ${catalog.approvedSpecies} approved species, as of ${readAt}.`;
  const treeLine =
    tree === null
      ? "- Taxonomy tree: none stored yet, no build has run."
      : `- Taxonomy tree: built at ${tree.builtAt}; ${tree.species} species resolved, ${counted(tree.errors, "error", "errors")} (names the build could not resolve).`;
  return ["### Data state", "", catalogLine, treeLine].join("\n");
}

/** semantic-release `generateNotes` step: the section that is appended to the release notes. */
export function generateNotes() {
  return renderDataState(readDataState());
}
