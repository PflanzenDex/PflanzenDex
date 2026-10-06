import type { ErrorDetail } from "../../kernel";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date `YYYY-MM-DD` (no 30 February), as the user's local date (NFR-08). */
export function dateField(field: string) {
  return (value: unknown): string | ErrorDetail => {
    const share = typeof value === "string" ? DATE.exec(value) : null;
    if (share) {
      const [, j, m, t] = share.map(Number);
      const d = new Date(Date.UTC(j as number, (m as number) - 1, t as number));
      if (d.getUTCFullYear() === j && d.getUTCMonth() === (m as number) - 1 && d.getUTCDate() === t)
        return value as string;
    }
    return { field, code: "input.invalid" };
  };
}

/** A number on the grid of the step (0.5): without a grid the database would have to round silently (P-10). */
export function gridField(field: string, limits: { min: number; max: number }, step: number) {
  return (value: unknown): number | ErrorDetail =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= limits.min &&
    value <= limits.max &&
    Number.isInteger(value / step)
      ? value
      : { field, code: "input.invalid" };
}
