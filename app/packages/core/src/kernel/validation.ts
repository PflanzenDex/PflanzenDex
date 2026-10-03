import { isTimeZone } from "./date";
import { appError, type ErrorDetail } from "./error";
import { failed, ok, type Result } from "./result";

/** Fully validates unknown input; returns the typed input or all error details (P-03). */
export type Schema<T> = (input: unknown) => Result<T>;

const invalid = (field: string): ErrorDetail => ({ field, code: "input.invalid" });

export function textField(field: string, limits: { min: number; max: number }) {
  return (value: unknown): string | ErrorDetail => {
    if (typeof value !== "string") return invalid(field);
    const text = value.trim();
    return text.length >= limits.min && text.length <= limits.max ? text : invalid(field);
  };
}

export function numberField(field: string, limits: { min: number; max: number }) {
  return (value: unknown): number | ErrorDetail =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= limits.min &&
    value <= limits.max
      ? value
      : invalid(field);
}

/** Integer within the limits. */
export function integerField(field: string, limits: { min: number; max: number }) {
  return (value: unknown): number | ErrorDetail =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= limits.min &&
    value <= limits.max
      ? value
      : invalid(field);
}

export function choiceField<const W extends string>(field: string, allowed: readonly W[]) {
  return (value: unknown): W | ErrorDetail => allowed.find((e) => e === value) ?? invalid(field);
}

/** An IANA time zone name, e.g. `Europe/Berlin` (NFR-08). */
export function timeZoneField(field: string) {
  return (value: unknown): string | ErrorDetail => (isTimeZone(value) ? value : invalid(field));
}

/** If the value is missing (undefined or null) it is "not given" (null); otherwise the check applies. */
export function orNull<T>(check: (value: unknown) => T | ErrorDetail) {
  return (value: unknown): T | ErrorDetail | null =>
    value === undefined || value === null ? null : check(value);
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isId = (value: unknown): value is string =>
  typeof value === "string" && ID.test(value);

/** A UUID (returned in lowercase). */
export function idField(field: string) {
  return (value: unknown): string | ErrorDetail =>
    typeof value === "string" && ID.test(value) ? value.toLowerCase() : invalid(field);
}

/** Lowercase letters and underscores, e.g. `species`. */
export function identifierField(field: string, max: number) {
  return (value: unknown): string | ErrorDetail =>
    typeof value === "string" && value.length <= max && /^[a-z_]+$/.test(value)
      ? value
      : invalid(field);
}

type Reviewer = (value: unknown) => unknown;
type Reviewed<P extends Record<string, Reviewer>> = {
  [K in keyof P]: Exclude<ReturnType<P[K]>, ErrorDetail>;
};

const isDetail = (x: unknown): x is ErrorDetail =>
  typeof x === "object" && x !== null && "field" in x && "code" in x;

/** Object schema: unknown fields are dropped, missing or invalid ones report all details. */
export function shape<P extends Record<string, Reviewer>>(fields: P): Schema<Reviewed<P>> {
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
