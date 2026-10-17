import {
  appError,
  failed,
  idField,
  integerField,
  ok,
  textField,
  type ErrorDetail,
  type Schema,
} from "../../kernel";
import {
  CARE_PROFILE_LIMITS,
  OVERRIDABLE_FIELDS,
  type CareProfileChanges,
  type OverridableField,
} from "./care-profile-types";

export interface CareProfileInput {
  readonly speciesId: string;
  readonly changes: CareProfileChanges;
}

const invalid = (field: string): ErrorDetail => ({ field, code: "input.invalid" });
const isDetail = (x: unknown): x is ErrorDetail =>
  typeof x === "object" && x !== null && "field" in x && "code" in x;

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** `MM-DD` (month-day, no year); February 29 is allowed, like in the species catalog. */
const monthDay = (field: string) => (value: unknown) => {
  const m = typeof value === "string" ? /^(\d\d)-(\d\d)$/.exec(value) : null;
  const month = Number(m?.[1]);
  const day = Number(m?.[2]);
  return m && month >= 1 && month <= 12 && day >= 1 && day <= (DAYS[month - 1] ?? 0)
    ? m[0]
    : invalid(field);
};

/** Value checks per overridable field. `null` always means "reset to the catalog" and is handled before. */
const CHECKS: Record<OverridableField, (value: unknown) => unknown> = {
  growthLocationId: idField("growthLocationId"),
  dormancyLocationId: idField("dormancyLocationId"),
  lightZoneId: idField("lightZoneId"),
  dormancyFrom: monthDay("dormancyFrom"),
  dormancyUntil: monthDay("dormancyUntil"),
  wateringGrowthDays: integerField("wateringGrowthDays", CARE_PROFILE_LIMITS.wateringDays),
  wateringDormancyDays: integerField("wateringDormancyDays", CARE_PROFILE_LIMITS.wateringDays),
  ownHints: textField("ownHints", CARE_PROFILE_LIMITS.ownHints),
};

/** The dormancy period only counts as a pair, in a request as well: both set or both reset. */
function pairProblem(changes: Record<string, unknown>): ErrorDetail[] {
  const from = changes["dormancyFrom"];
  const until = changes["dormancyUntil"];
  if (from === undefined && until === undefined) return [];
  if (from === undefined) return [invalid("dormancyFrom")];
  if (until === undefined) return [invalid("dormancyUntil")];
  return (from === null) === (until === null) ? [] : [invalid("dormancyUntil")];
}

function checkChanges(source: Record<string, unknown>, details: ErrorDetail[]) {
  const known: readonly string[] = ["speciesId", ...OVERRIDABLE_FIELDS];
  for (const key of Object.keys(source)) if (!known.includes(key)) details.push(invalid(key));
  const changes: Record<string, unknown> = {};
  for (const field of OVERRIDABLE_FIELDS) {
    const value = source[field];
    if (value === undefined) continue;
    const checked = value === null ? null : CHECKS[field](value);
    if (isDetail(checked)) details.push(checked);
    else changes[field] = checked;
  }
  details.push(...pairProblem(changes));
  return changes;
}

/**
 * Only the overridable fields (FR-BES-09): a catalog field is refused by name, not dropped silently (P-10). Absent =
 * unchanged, `null` = reset to the catalog, a value = set. A request that changes nothing is invalid.
 */
export const careProfileSchema: Schema<CareProfileInput> = (input) => {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return failed(appError("input.invalid", { details: [invalid("")] }));
  const source = input as Record<string, unknown>;
  const speciesId = idField("speciesId")(source["speciesId"]);
  const details: ErrorDetail[] = isDetail(speciesId) ? [speciesId] : [];
  const changes = checkChanges(source, details);
  if (Object.keys(changes).length === 0 && details.length === 0) details.push(invalid("changes"));
  if (details.length > 0 || isDetail(speciesId))
    return failed(appError("input.invalid", { details }));
  return ok({ speciesId, changes: changes as CareProfileChanges });
};
