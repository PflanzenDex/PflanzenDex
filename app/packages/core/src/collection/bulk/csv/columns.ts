// Columns and dates of the import file (US-BES-18, FR-BES-26). Columns are matched by the normalized header name, in German
// or English; unknown columns are ignored. Dates are `YYYY-MM-DD` or `DD.MM.YYYY`. Pure, no I/O (AB-1).
import { appError, failed, isCalendarDate, normalizeName, ok, type Result } from "../../../kernel";
import type { ImportDate } from "../types";

const COLUMN_NAMES = {
  species: ["art", "species name"],
  nickname: ["spitzname", "nickname"],
  location: ["standort", "location"],
  purchaseDate: ["kaufdatum", "purchase date"],
  notes: ["notizen", "notes"],
} as const;

export type Column = keyof typeof COLUMN_NAMES;
export type ColumnIndex = Partial<Record<Column, number>>;

const COLUMNS = Object.keys(COLUMN_NAMES) as Column[];

const columnOf = (name: string): Column | undefined =>
  COLUMNS.find((field) => (COLUMN_NAMES[field] as readonly string[]).includes(name));

/**
 * The position of every known column by its normalized header name. The species column is required; a known column
 * that appears twice is refused, so no value is taken from a column the keeper did not mean.
 */
export function columnsOf(header: readonly string[]): Result<ColumnIndex> {
  const found: ColumnIndex = {};
  for (const [position, cell] of header.entries()) {
    const field = columnOf(normalizeName(cell));
    if (field === undefined) continue;
    if (found[field] !== undefined) return failed(appError("import.column_repeated"));
    found[field] = position;
  }
  return found.species === undefined ? failed(appError("import.no_species_column")) : ok(found);
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const GERMAN = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/** A date cell: absent, a calendar date in `YYYY-MM-DD` or `DD.MM.YYYY`, or invalid (unknown format, impossible date). */
export function parseDate(raw: string): ImportDate {
  const text = raw.trim();
  if (text === "") return { kind: "absent" };
  const iso = ISO.exec(text);
  const german = GERMAN.exec(text);
  const value = iso
    ? [iso[1], iso[2], iso[3]].join("-")
    : german
      ? [german[3], german[2], german[1]].join("-")
      : "";
  return isCalendarDate(value) ? { kind: "iso", value } : { kind: "invalid", raw: text };
}
