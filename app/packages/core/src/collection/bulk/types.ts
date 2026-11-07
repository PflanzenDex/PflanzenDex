// CSV import of plants (US-BES-18, FR-BES-26): limits, the keeper switch and the ports the import reads and writes through.
// The rules are pure; the adapters (catalog reads, stores) are passed in by the API (AB-1, AB-2).

/** Limits of one file (FR-BES-26, starting values, assumption). Bytes count UTF-8 bytes. */
export const IMPORT_LIMITS = { rows: 500, bytes: 1024 * 1024 } as const;

/** Species candidates shown for a name that does not match exactly (the same cap as the naming rule, assumption). */
export const IMPORT_CANDIDATES = 20;

/** From this many active specimens of a species on, every one of them has a marker (US-BES-03, DM-BES-03). */
export const ACTIVE_FOR_MARKERS = 3;

/** The keeper switch of the import (US-ONB-09, P-12): while it is off nothing is read or written. */
export const CSV_IMPORT_KEEPER_SWITCH = "csv_import";

/** A species as the catalog shows it to the account: the names an exact match compares with (US-BES-01, P-04). */
export interface SpeciesCandidate {
  readonly id: string;
  readonly latinName: string;
  readonly germanName: string | null;
  readonly synonyms: readonly string[];
}

/**
 * Port: the visible species a name can mean. `exact` answers the species whose name or synonym equals the text as a whole
 * (no cap, FR-BES-24); `search` answers the partial matches of the catalog search, capped, with `more` when more match.
 * The API fills it from the catalog reads, the same ones the app's search uses (KI-R10).
 */
export interface ImportSpeciesSource {
  exact(userId: string, text: string): Promise<readonly SpeciesCandidate[]>;
  search(
    userId: string,
    text: string,
  ): Promise<{ readonly species: readonly SpeciesCandidate[]; readonly more: boolean }>;
}

/**
 * A date cell after parsing: `absent` (today on create), `iso` (`YYYY-MM-DD`, an existing calendar date) or `invalid`
 * (an unknown format or an impossible date such as 31.02.2026, which flags the row).
 */
export type ImportDate =
  | { readonly kind: "absent" }
  | { readonly kind: "iso"; readonly value: string }
  | { readonly kind: "invalid"; readonly raw: string };

/** One data row of the file as the parser reads it: cells trimmed, empty cells `null`. `line` is the physical line. */
export interface ParsedRow {
  readonly line: number;
  readonly species: string;
  readonly nickname: string | null;
  readonly location: string | null;
  readonly purchaseDate: ImportDate;
  readonly notes: string | null;
}
