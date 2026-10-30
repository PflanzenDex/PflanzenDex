// Species attributes with source and license per field (DM-ENT-01, US-ENT-09). Pure: checks a researched value before it
// may be stored and turns stored facts into the attributes of a suggestion. A value without a citable source and a free
// license is rejected, an unknown value stays `null` and acts neutrally (P-08, FR-ENT-04). Nothing here is a statement
// of an AI: only the three citable sources below are accepted (US-KI-06).

/**
 * The attributes of DM-ENT-01 of one suggestion. A value without a stored fact is `null` ("unbekannt", FR-ENT-04); no
 * value is guessed (P-08).
 */
export interface SuggestionAttributes {
  readonly humidity: "low" | "medium" | "high" | null;
  readonly minTemperature: number | null;
  readonly toxicToPets: boolean | null;
  readonly growthSize: "small" | "medium" | "large" | null;
  /**
   * The light statement of a source (US-ENT-09), shown as "Licht laut Quelle". Assumption, decided by the PO: it never
   * feeds the light zone derivation or the scoring (zones are numeric lux, a mapping would be an invented number, P-08).
   */
  readonly lightDescription: LightDescription | null;
}

/** All attributes unknown (FR-ENT-04): the start of every suggestion before stored facts are added. */
export const NO_ATTRIBUTES: SuggestionAttributes = {
  humidity: null,
  minTemperature: null,
  toxicToPets: null,
  growthSize: null,
  lightDescription: null,
};

/** Fixed value set of the light statement (assumption, decided by the PO, revisable). */
export const LIGHT_DESCRIPTIONS = ["low", "medium", "bright_indirect", "direct_sun"] as const;
export type LightDescription = (typeof LIGHT_DESCRIPTIONS)[number];

/** Where one stored attribute value comes from (US-ENT-09, P-08): shown beside the value. */
export interface AttributeSource {
  readonly field: keyof SuggestionAttributes;
  readonly source: AttributeSourceName;
  /** https link to the exact page or record. */
  readonly url: string;
  readonly license: string;
  /** Calendar date (YYYY-MM-DD) of the retrieval. */
  readonly retrievedAt: string;
  /** Review status of the value (FR-BES-06): every stored value counts as unreviewed until a review exists. */
  readonly review: "unreviewed";
}

/** The fields of DM-ENT-01 that carry a value. "Needs dormancy" is derived from the dormancy period, not stored. */
export const ATTRIBUTE_FIELDS = [
  "humidity",
  "minTemperature",
  "growthSize",
  "toxicToPets",
  "lightDescription",
] as const;
export type AttributeField = (typeof ATTRIBUTE_FIELDS)[number];

/** The citable sources (P-08). Assumption, decided by the PO: no other source and no operator opinion counts. */
export const ATTRIBUTE_SOURCES = ["gbif", "wikipedia", "wikidata"] as const;
export type AttributeSourceName = (typeof ATTRIBUTE_SOURCES)[number];

/** Free licenses the shared catalog may keep (assumption, decided by the PO; same family as the images, FR-POK-07). */
export const ATTRIBUTE_LICENSES = ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-SA-3.0"] as const;

/** Evidence of one field: where the value comes from, under which license and when it was read. */
export interface AttributeEvidence {
  readonly source: AttributeSourceName;
  /** https link to the exact page or record. */
  readonly url: string;
  readonly license: (typeof ATTRIBUTE_LICENSES)[number];
  /** Calendar date (YYYY-MM-DD) of the retrieval. */
  readonly retrievedAt: string;
}

export type AttributeValue =
  | "low"
  | "medium"
  | "high"
  | "small"
  | "large"
  | "bright_indirect"
  | "direct_sun"
  | number
  | boolean;

export interface AttributeFact {
  /** Latin name of the species, the key of the catalog tree. */
  readonly species: string;
  readonly field: AttributeField;
  readonly value: AttributeValue;
  readonly evidence: AttributeEvidence;
}

/** Plausible range of the minimum temperature in degrees Celsius (a value outside is an extraction error, not data). */
export const MIN_TEMPERATURE_RANGE = { min: -30, max: 30 } as const;

const SCALE = {
  humidity: ["low", "medium", "high"],
  growthSize: ["small", "medium", "large"],
  lightDescription: LIGHT_DESCRIPTIONS,
} as const;

export type AttributeProblem =
  | "attribute.species_invalid"
  | "attribute.field_unknown"
  | "attribute.value_invalid"
  | "attribute.source_unknown"
  | "attribute.url_invalid"
  | "attribute.license_missing"
  | "attribute.date_invalid";

export type AttributeCheck =
  | { readonly ok: true; readonly fact: AttributeFact }
  | { readonly ok: false; readonly problems: readonly AttributeProblem[] };

function valueFits(field: unknown, value: unknown): boolean {
  if (field === "humidity" || field === "growthSize" || field === "lightDescription")
    return (SCALE[field] as readonly unknown[]).includes(value);
  if (field === "minTemperature")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= MIN_TEMPERATURE_RANGE.min &&
      value <= MIN_TEMPERATURE_RANGE.max
    );
  return field === "toxicToPets" && typeof value === "boolean";
}

function dateFits(d: unknown): boolean {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const parsed = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(d);
}

/** An https link with a host, without credentials or whitespace (no URL parser in `core`: it has no I/O or platform types). */
function urlFits(u: unknown): boolean {
  if (typeof u !== "string" || u.length > 2000 || !u.startsWith("https://") || /\s/.test(u))
    return false;
  const authority = u.slice("https://".length).split(/[/?#]/, 1)[0] ?? "";
  return authority.length > 0 && !authority.includes("@");
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const oneOf = (list: readonly unknown[], x: unknown) => list.includes(x);

function factProblems(raw: Record<string, unknown>): AttributeProblem[] {
  const problems: AttributeProblem[] = [];
  if (typeof raw.species !== "string" || raw.species.trim().length < 2 || raw.species.length > 160)
    problems.push("attribute.species_invalid");
  if (!oneOf(ATTRIBUTE_FIELDS, raw.field)) problems.push("attribute.field_unknown");
  else if (!valueFits(raw.field, raw.value)) problems.push("attribute.value_invalid");
  return problems;
}

function evidenceProblems(ev: Record<string, unknown>): AttributeProblem[] {
  const checks: [boolean, AttributeProblem][] = [
    [oneOf(ATTRIBUTE_SOURCES, ev.source), "attribute.source_unknown"],
    [urlFits(ev.url), "attribute.url_invalid"],
    [oneOf(ATTRIBUTE_LICENSES, ev.license), "attribute.license_missing"],
    [dateFits(ev.retrievedAt), "attribute.date_invalid"],
  ];
  return checks.filter(([fits]) => !fits).map(([, problem]) => problem);
}

/**
 * Checks one researched value. Every problem is reported, not only the first (P-10). A field is accepted only with all
 * of: a value of its type and range, one of the citable sources, an https link, a free license and a retrieval date.
 */
export function checkAttributeFact(input: unknown): AttributeCheck {
  const raw = isObject(input) ? input : {};
  const problems = [
    ...factProblems(raw),
    ...evidenceProblems(isObject(raw.evidence) ? raw.evidence : {}),
  ];
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, fact: raw as unknown as AttributeFact };
}

/** The attributes of the species out of its stored facts; a field without a fact stays `null` ("unbekannt"). */
export function attributesOf(facts: readonly AttributeFact[]): SuggestionAttributes {
  const value = <T extends AttributeValue>(field: AttributeField) =>
    (facts.find((f) => f.field === field)?.value as T | undefined) ?? null;
  return {
    humidity: value<"low" | "medium" | "high">("humidity"),
    minTemperature: value<number>("minTemperature"),
    toxicToPets: value<boolean>("toxicToPets"),
    growthSize: value<"small" | "medium" | "large">("growthSize"),
    lightDescription: value<LightDescription>("lightDescription"),
  };
}

/** The source of each stored fact, in field order; a field without a fact has none and stays unknown (P-08). */
export function sourcesOf(facts: readonly AttributeFact[]): AttributeSource[] {
  return ATTRIBUTE_FIELDS.flatMap((field) => {
    const e = facts.find((f) => f.field === field)?.evidence;
    if (e === undefined) return [];
    const { source, url, license, retrievedAt } = e;
    return [{ field, source, url, license, retrievedAt, review: "unreviewed" as const }];
  });
}
