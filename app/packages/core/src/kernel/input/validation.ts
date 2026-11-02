import { isCalendarDate, isTimeZone } from "./date";
import { appError, type ErrorDetail } from "../error";
import { failed, ok, type Result } from "../result";
import { described, jsonSchemaOf, nullable } from "./json-schema";

/** Fully validates unknown input; returns the typed input or all error details (P-03). */
export type Schema<T> = (input: unknown) => Result<T>;

const invalid = (field: string): ErrorDetail => ({ field, code: "input.invalid" });

export function textField(field: string, limits: { min: number; max: number }) {
  const check = (value: unknown): string | ErrorDetail => {
    if (typeof value !== "string") return invalid(field);
    const text = value.trim();
    return text.length >= limits.min && text.length <= limits.max ? text : invalid(field);
  };
  return described(check, { type: "string", minLength: limits.min, maxLength: limits.max });
}

export function numberField(field: string, limits: { min: number; max: number }) {
  const check = (value: unknown): number | ErrorDetail =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= limits.min &&
    value <= limits.max
      ? value
      : invalid(field);
  return described(check, { type: "number", minimum: limits.min, maximum: limits.max });
}

/** Integer within the limits. */
export function integerField(field: string, limits: { min: number; max: number }) {
  const check = (value: unknown): number | ErrorDetail =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= limits.min &&
    value <= limits.max
      ? value
      : invalid(field);
  return described(check, { type: "integer", minimum: limits.min, maximum: limits.max });
}

export function choiceField<const W extends string>(field: string, allowed: readonly W[]) {
  const check = (value: unknown): W | ErrorDetail =>
    allowed.find((e) => e === value) ?? invalid(field);
  return described(check, { type: "string", enum: [...allowed] });
}

/** An IANA time zone name, e.g. `Europe/Berlin` (NFR-08). */
export function timeZoneField(field: string) {
  const check = (value: unknown): string | ErrorDetail =>
    isTimeZone(value) ? value : invalid(field);
  return described(check, { type: "string", minLength: 1 });
}

/** A calendar date `YYYY-MM-DD` from 1900 on that exists in the calendar (NFR-08); no time of day. */
export function calendarDateField(field: string) {
  const check = (value: unknown): string | ErrorDetail =>
    isCalendarDate(value) && value >= "1900-01-01" ? value : invalid(field);
  return described(check, { type: "string", format: "date" });
}

/** If the value is missing (undefined or null) it is "not given" (null); otherwise the check applies. */
export function orNull<T>(check: (value: unknown) => T | ErrorDetail) {
  const maybe = (value: unknown): T | ErrorDetail | null =>
    value === undefined || value === null ? null : check(value);
  return described(maybe, () => nullable(jsonSchemaOf(check) ?? {}));
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID = { type: "string", format: "uuid" } as const;

export const isId = (value: unknown): value is string =>
  typeof value === "string" && ID.test(value);

/** A UUID (returned in lowercase). */
export function idField(field: string) {
  const check = (value: unknown): string | ErrorDetail =>
    typeof value === "string" && ID.test(value) ? value.toLowerCase() : invalid(field);
  return described(check, UUID);
}

/** A list of 1 to `max` UUIDs (lowercase); the same ID twice counts once, the order of first appearance stays. */
export function idListField(field: string, max: number) {
  const check = (value: unknown): string[] | ErrorDetail => {
    if (!Array.isArray(value) || value.length < 1 || value.length > max) return invalid(field);
    const ids = value.map((id) => (isId(id) ? id.toLowerCase() : null));
    return ids.every((id) => id !== null) ? [...new Set(ids)] : invalid(field);
  };
  return described(check, { type: "array", items: UUID, minItems: 1, maxItems: max });
}

/** Lowercase letters and underscores, e.g. `species`. */
export function identifierField(field: string, max: number) {
  const check = (value: unknown): string | ErrorDetail =>
    typeof value === "string" && value.length <= max && /^[a-z_]+$/.test(value)
      ? value
      : invalid(field);
  return described(check, { type: "string", pattern: "^[a-z_]+$", maxLength: max });
}

type Reviewer = (value: unknown) => unknown;
type Reviewed<P extends Record<string, Reviewer>> = {
  [K in keyof P]: Exclude<ReturnType<P[K]>, ErrorDetail>;
};

const isDetail = (x: unknown): x is ErrorDetail =>
  typeof x === "object" && x !== null && "field" in x && "code" in x;

/**
 * The JSON Schema of an object schema: every field with its own schema; a field is required when its check refuses a
 * missing value, so the list follows the checks.
 */
function objectJson(fields: Record<string, Reviewer>) {
  const entries = Object.entries(fields);
  return {
    type: "object",
    properties: Object.fromEntries(entries.map(([k, check]) => [k, jsonSchemaOf(check) ?? {}])),
    required: entries.filter(([, check]) => isDetail(check(undefined))).map(([k]) => k),
    additionalProperties: false,
  };
}

/** Object schema: unknown fields are dropped, missing or invalid ones report all details; it carries its JSON Schema. */
export function shape<P extends Record<string, Reviewer>>(fields: P): Schema<Reviewed<P>> {
  return described(objectSchema(fields), () => objectJson(fields));
}

function objectSchema<P extends Record<string, Reviewer>>(fields: P): Schema<Reviewed<P>> {
  return (input) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return failed(appError("input.invalid", { details: [invalid("")] }));
    }
    const source = input as Record<string, unknown>;
    const value: Record<string, unknown> = {};
    const details: ErrorDetail[] = [];
    for (const [name, check] of Object.entries(fields)) {
      const r = check(source[name]);
      if (isDetail(r)) details.push(r);
      else value[name] = r;
    }
    return details.length > 0
      ? failed(appError("input.invalid", { details }))
      : ok(value as Reviewed<P>);
  };
}
