// Check of the researched start-catalog data (US-ENT-09, #1005). Pure: takes the parsed files, the Latin names of the
// start list and the operator's local day, and returns the facts to store or every problem with file, species and
// attribute (P-10). Each value runs through `checkAttributeFact` of `core` (type, range, source, https, license, date);
// on top of that the data files allow only the hosts of the citable sources (E-25), no date in the future, no unknown
// key (no running text slipped in) and every species once and only from the start list.
import {
  ATTRIBUTE_FIELDS,
  checkAttributeFact,
  type AttributeFact,
  type AttributeProblem,
} from "@pflanzendex/core";

/** One data file: its path relative to the data folder and its parsed JSON, or `undefined` when it does not parse. */
export interface ResearchFile {
  readonly path: string;
  readonly json: unknown;
}

export type DataProblem =
  | AttributeProblem
  | "data.json_invalid"
  | "data.format_invalid"
  | "data.species_not_in_start_list"
  | "data.species_duplicate"
  | "data.host_not_allowed"
  | "data.date_in_future"
  | "data.key_unknown"
  | "data.note_invalid";

export interface DataIssue {
  readonly file: string;
  readonly species: string | null;
  readonly attribute: string | null;
  readonly problem: DataProblem;
}

export interface DataCheck {
  /** Facts ready to store; empty when there is any issue (all or nothing). */
  readonly facts: readonly AttributeFact[];
  readonly issues: readonly DataIssue[];
  readonly species: number;
}

/** Hosts per citable source (E-25). Assumption, decided by the PO: Commons counts as Wikipedia (same license family). */
export const ALLOWED_HOSTS: Readonly<Record<string, AttributeFact["evidence"]["source"]>> = {
  "gbif.org": "gbif",
  "api.gbif.org": "gbif",
  "wikidata.org": "wikidata",
  "www.wikidata.org": "wikidata",
  "de.wikipedia.org": "wikipedia",
  "en.wikipedia.org": "wikipedia",
  "commons.wikimedia.org": "wikipedia",
};

const VALUE_KEYS = ["value", "sourceUrl", "sourceName", "license", "retrievedOn", "note"];
/** A note explains a value for the reviewer; longer text is suspicious of copied running text (starting value). */
export const NOTE_MAX = 300;

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

function hostOf(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** The extra rules of the data files for one value; `checkAttributeFact` covers the rest. */
function fileRules(raw: Record<string, unknown>, today: string): DataProblem[] {
  const problems: DataProblem[] = [];
  if (Object.keys(raw).some((k) => !VALUE_KEYS.includes(k))) problems.push("data.key_unknown");
  const host = hostOf(raw.sourceUrl);
  if (host !== null && ALLOWED_HOSTS[host] !== raw.sourceName)
    problems.push("data.host_not_allowed");
  if (
    typeof raw.retrievedOn === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(raw.retrievedOn) &&
    raw.retrievedOn > today
  )
    problems.push("data.date_in_future");
  if (
    raw.note !== undefined &&
    (typeof raw.note !== "string" || raw.note.length === 0 || raw.note.length > NOTE_MAX)
  )
    problems.push("data.note_invalid");
  return problems;
}

function checkValue(
  species: string,
  field: string,
  raw: unknown,
  today: string,
): { fact: AttributeFact | null; problems: DataProblem[] } {
  const value = isObject(raw) ? raw : {};
  const checked = checkAttributeFact({
    species,
    field,
    value: value.value,
    evidence: {
      source: value.sourceName,
      url: value.sourceUrl,
      license: value.license,
      retrievedAt: value.retrievedOn,
    },
  });
  const problems = [...(checked.ok ? [] : checked.problems), ...fileRules(value, today)];
  return { fact: checked.ok && problems.length === 0 ? checked.fact : null, problems };
}

interface Context {
  readonly start: ReadonlySet<string>;
  readonly today: string;
  readonly seen: Set<string>;
  readonly facts: AttributeFact[];
  readonly issues: DataIssue[];
}

function checkRecord(file: string, record: unknown, ctx: Context): void {
  const issue = (species: string | null, attribute: string | null, problem: DataProblem) =>
    ctx.issues.push({ file, species, attribute, problem });
  const ok = isObject(record) && typeof record.species === "string" && isObject(record.attributes);
  if (!ok || Object.keys(record).some((k) => k !== "species" && k !== "attributes"))
    return void issue(null, null, "data.format_invalid");
  const species = record.species as string;
  if (!ctx.start.has(species)) issue(species, null, "data.species_not_in_start_list");
  if (ctx.seen.has(species)) issue(species, null, "data.species_duplicate");
  ctx.seen.add(species);
  for (const [field, raw] of Object.entries(record.attributes as Record<string, unknown>)) {
    if (!(ATTRIBUTE_FIELDS as readonly string[]).includes(field)) {
      issue(species, field, "attribute.field_unknown");
      continue;
    }
    const { fact, problems } = checkValue(species, field, raw, ctx.today);
    for (const p of problems) issue(species, field, p);
    if (fact) ctx.facts.push(fact);
  }
}

/**
 * Checks all data files. `startList` are the Latin names of the curated start list, `today` the operator's local day
 * (YYYY-MM-DD). A file is a JSON array of records `{ species, attributes: { <field>: { value, sourceUrl, sourceName,
 * license, retrievedOn, note? } } }`; a missing attribute is unknown (P-08).
 */
export function checkResearchData(
  files: readonly ResearchFile[],
  startList: readonly string[],
  today: string,
): DataCheck {
  const ctx: Context = { start: new Set(startList), today, seen: new Set(), facts: [], issues: [] };
  for (const f of files) {
    if (f.json === undefined)
      ctx.issues.push({
        file: f.path,
        species: null,
        attribute: null,
        problem: "data.json_invalid",
      });
    else if (!Array.isArray(f.json))
      ctx.issues.push({
        file: f.path,
        species: null,
        attribute: null,
        problem: "data.format_invalid",
      });
    else for (const record of f.json) checkRecord(f.path, record, ctx);
  }
  const clean = ctx.issues.length === 0;
  return { facts: clean ? ctx.facts : [], issues: ctx.issues, species: ctx.seen.size };
}

/** One line per issue for the operator: file, species / attribute and the problem code. */
export function issueLine(i: DataIssue): string {
  const where = [i.species, i.attribute].filter((x) => x !== null).join(" / ");
  return `${i.file}${where ? `: ${where}` : ""}: ${i.problem}`;
}
