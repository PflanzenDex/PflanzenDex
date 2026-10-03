import {
  appError,
  failed,
  integerField,
  shape,
  textField,
  choiceField,
  type Result,
  type ErrorDetail,
} from "../../kernel";
import { parseLatin, type LatinName } from "./name";
import { SPECIES_LIMITS, GROWTH_MEASURES } from "./types";

const invalid = (field: string): ErrorDetail => ({ field, code: "input.invalid" });
const empty = (value: unknown) =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/** Free text that may be missing: empty means "unknown" (null), never an invented value (P-08). */
const optional = (field: string, max: number) => {
  const check = textField(field, { min: 1, max });
  return (value: unknown): string | ErrorDetail | null => (empty(value) ? null : check(value));
};

const latinField = (value: unknown): LatinName | ErrorDetail =>
  (typeof value === "string" && parseLatin(value)) || invalid("latinName");

const synonymField = (value: unknown): string[] | ErrorDetail => {
  if (empty(value)) return [];
  const check = textField("synonyms", SPECIES_LIMITS.name);
  if (!Array.isArray(value) || value.length > SPECIES_LIMITS.synonyms) return invalid("synonyms");
  const texts = value.map(check);
  const text = (t: string | ErrorDetail): t is string => typeof t === "string";
  return texts.every(text) ? [...new Set(texts)] : invalid("synonyms");
};

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** `MM-DD` (month-day, no year); February 29 is allowed. */
const validTag = (month: number, tag: number) =>
  month >= 1 && month <= 12 && tag >= 1 && tag <= (DAYS[month - 1] ?? 0);

export const monthTag = (field: string) => (value: unknown) => {
  if (empty(value)) return null;
  const m = typeof value === "string" ? /^(\d\d)-(\d\d)$/.exec(value) : null;
  return m && validTag(Number(m[1]), Number(m[2])) ? m[0] : invalid(field);
};

const base = shape({
  latinName: latinField,
  germanName: optional("germanName", SPECIES_LIMITS.name.max),
  englishName: optional("englishName", SPECIES_LIMITS.name.max),
  synonyms: synonymField,
  familyGerman: optional("familyGerman", SPECIES_LIMITS.name.max),
  familyLatin: optional("familyLatin", SPECIES_LIMITS.name.max),
  difficulty: integerField("difficulty", SPECIES_LIMITS.difficulty),
  standardLevel: integerField("standardLevel", SPECIES_LIMITS.standardLevel),
  lightDemandLux: integerField("lightDemandLux", SPECIES_LIMITS.lightDemandLux),
  dormancyFrom: monthTag("dormancyFrom"),
  dormancyUntil: monthTag("dormancyUntil"),
  locationHint: optional("locationHint", SPECIES_LIMITS.short.max),
  growthMeasure: choiceField("growthMeasure", GROWTH_MEASURES),
  etiolationSigns: textField("etiolationSigns", SPECIES_LIMITS.lang),
  wateringHint: optional("wateringHint", SPECIES_LIMITS.short.max),
  substrate: optional("substrate", SPECIES_LIMITS.short.max),
  pruning: optional("pruning", SPECIES_LIMITS.short.max),
  growthHacks: optional("growthHacks", SPECIES_LIMITS.short.max),
  successCriteria: textField("successCriteria", SPECIES_LIMITS.lang),
  botanicalStory: optional("botanicalStory", SPECIES_LIMITS.lang.max),
  source: optional("source", SPECIES_LIMITS.short.max),
});

export type SpeciesInput = ReturnType<typeof base> extends Result<infer T> ? T : never;

/** The dormancy phase counts only as a pair (from and until), otherwise it is unknown. */
export function speciesSchema(input: unknown): Result<SpeciesInput> {
  const r = base(input);
  if (!r.ok || (r.value.dormancyFrom === null) === (r.value.dormancyUntil === null)) return r;
  const field = r.value.dormancyFrom === null ? "dormancyFrom" : "dormancyUntil";
  return failed(appError("input.invalid", { details: [invalid(field)] }));
}
