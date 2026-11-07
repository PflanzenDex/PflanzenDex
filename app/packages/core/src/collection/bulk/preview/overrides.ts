// The fixes the keeper gives to flagged rows on the import page (US-BES-18): a species chosen from the candidates, a marker
// that replaces the nickname, or a skip. The preview applies them and then judges the fixed rows exactly as before; the
// server stays the only judge, the page never decides that a row is ready (P-01, P-03).
import {
  appError,
  described,
  failed,
  idField,
  integerField,
  ok,
  orNull,
  shape,
  type ErrorDetail,
  type Result,
} from "../../../kernel";
import { IMPORT_LIMITS, type ImportSpeciesSource, type ParsedRow } from "../types";
import type { SpeciesMatch } from "./rules";

/** One fix, keyed by the line of the file (US-BES-18). `null` means the fix is not given. */
export interface ImportOverride {
  readonly line: number;
  /** The species the keeper chose; replaces the name match of the row. */
  readonly speciesId: string | null;
  /** The marker that replaces the nickname; an empty text means none. */
  readonly marker: string | null;
  readonly skip: boolean;
}

const invalid = (field: string): ErrorDetail => ({ field, code: "input.invalid" });

// The marker is checked like a nickname (`checks.ts`), so a text too long or blank is flagged on its row, not refused here.
const markerField = described(
  (value: unknown): string | ErrorDetail =>
    typeof value === "string" ? value.trim() : invalid("marker"),
  { type: "string" },
);

const skipField = described(
  (value: unknown): boolean | ErrorDetail => (typeof value === "boolean" ? value : invalid("skip")),
  { type: "boolean" },
);

const overrideSchema = shape({
  line: integerField("line", { min: 1, max: 1_000_000 }),
  speciesId: orNull(idField("speciesId")),
  marker: orNull(markerField),
  skip: orNull(skipField),
});

/** The optional list of fixes: at most one per line and at most one per row of the file; missing means none. */
export function overridesField(value: unknown): readonly ImportOverride[] | ErrorDetail {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > IMPORT_LIMITS.rows) return invalid("overrides");
  const list: ImportOverride[] = [];
  for (const item of value) {
    const parsed = overrideSchema(item);
    if (!parsed.ok) return invalid("overrides");
    const { line, speciesId, marker, skip } = parsed.value;
    list.push({ line, speciesId, marker, skip: skip === true });
  }
  return new Set(list.map((o) => o.line)).size === list.length ? list : invalid("overrides");
}

/** The rows with the marker fixes applied, and what the other fixes ask for. */
export interface FixedRows {
  /** Every row of the file in file order; a row with a marker fix carries it as its nickname. */
  readonly rows: readonly ParsedRow[];
  /** The lines the keeper skipped: they leave the plan completely. */
  readonly skipped: ReadonlySet<number>;
  /** The species the keeper chose per line. */
  readonly chosen: ReadonlyMap<number, string>;
}

/** Applies the fixes to the parsed rows. A line that is not in the file is refused as `input.invalid` (US-BES-18). */
export function fixRows(
  rows: readonly ParsedRow[],
  overrides: readonly ImportOverride[],
): Result<FixedRows> {
  const known = new Set(rows.map((r) => r.line));
  if (overrides.some((o) => !known.has(o.line)))
    return failed(appError("input.invalid", { details: [invalid("overrides")] }));
  const byLine = new Map(overrides.map((o) => [o.line, o] as const));
  const fixed = rows.map((row) => {
    const fix = byLine.get(row.line);
    if (fix?.marker === undefined || fix?.marker === null) return row;
    return { ...row, nickname: fix.marker === "" ? null : fix.marker };
  });
  return ok({
    rows: fixed,
    skipped: new Set(overrides.filter((o) => o.skip).map((o) => o.line)),
    chosen: new Map(
      overrides.flatMap((o) => (o.speciesId ? [[o.line, o.speciesId] as const] : [])),
    ),
  });
}

/**
 * The species the keeper chose for each line, as the account sees it (P-04): a species it cannot see, or one that does not
 * exist, is no match, so the row stays flagged with `import.species_not_found` and is never ready.
 */
export async function chosenMatches(
  source: ImportSpeciesSource,
  userId: string,
  chosen: ReadonlyMap<number, string>,
): Promise<ReadonlyMap<number, SpeciesMatch>> {
  const entries = await Promise.all(
    [...chosen].map(async ([line, id]): Promise<readonly [number, SpeciesMatch]> => {
      const species = await source.byId(userId, id);
      return [line, species ? { kind: "ready", species } : { kind: "none" }];
    }),
  );
  return new Map(entries);
}
