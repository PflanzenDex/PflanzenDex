// Search, filter and sort of the caught species (US-POK-08). Pure view logic over what `pokedexOwnership` derived;
// nothing is stored (P-01). Species count and family total come from the taxonomy build (US-POK-03): where it is
// unknown it stays `null` and sorts last, no number is guessed (P-08).
import type { CaughtSpecies } from "./types";

export type PokedexFilter = "all" | "caught" | "species_poor";
export type PokedexSort = "family" | "alphabetical" | "catch_date" | "species_count";

export interface BrowseOptions {
  /** Free text; matched case-insensitively against species, German name, genus and family. */
  readonly query: string;
  readonly filter: PokedexFilter;
  readonly sort: PokedexSort;
}

export interface FamilyGroup {
  /** Latin family name; `null` is the group of species whose family is unknown. */
  readonly family: string | null;
  readonly familyGerman: string | null;
  /** Species of the family caught (after search and filter). */
  readonly caught: number;
  /** Species of the family in the tree; `null` as long as there is no tree. */
  readonly total: number | null;
  readonly species: readonly CaughtSpecies[];
}

export interface Browsed {
  /** Flat result for every sort except "family". */
  readonly flat: readonly CaughtSpecies[];
  /** Groups for the sort "family"; empty otherwise. */
  readonly groups: readonly FamilyGroup[];
}

/** Species-poor: the genus has at most 10 species (US-POK-01). */
export const SPECIES_POOR_MAX = 10;

const lower = (text: string) => text.toLocaleLowerCase("de");
const byName = (a: CaughtSpecies, b: CaughtSpecies) => a.species.localeCompare(b.species, "de");

function matches(c: CaughtSpecies, query: string): boolean {
  if (query === "") return true;
  const fields = [c.species, c.germanName, c.genus, c.familyLatin, c.familyGerman];
  return fields.some((f) => f !== null && lower(f).includes(query));
}

const keepsFilter = (c: CaughtSpecies, filter: PokedexFilter) =>
  filter !== "species_poor" ||
  (c.genusSpeciesCount !== null && c.genusSpeciesCount <= SPECIES_POOR_MAX);

/** Newest date first; a card without a date after the dated ones. */
const byCatchDate = (a: CaughtSpecies, b: CaughtSpecies) => {
  const [x, y] = [a.caughtDate.date, b.caughtDate.date];
  if (x === y) return byName(a, b);
  if (x === null) return 1;
  if (y === null) return -1;
  return y.localeCompare(x) || byName(a, b);
};

/** Ascending; an unknown count after the known ones. */
const bySpeciesCount = (a: CaughtSpecies, b: CaughtSpecies) => {
  const [x, y] = [a.genusSpeciesCount, b.genusSpeciesCount];
  if (x === y) return byName(a, b);
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y || byName(a, b);
};

function group(list: readonly CaughtSpecies[]): FamilyGroup[] {
  const per = new Map<string | null, CaughtSpecies[]>();
  for (const c of list) per.set(c.familyLatin, [...(per.get(c.familyLatin) ?? []), c]);
  const groups = [...per].map(([family, species]) => ({
    family,
    familyGerman: species.find((c) => c.familyGerman !== null)?.familyGerman ?? null,
    caught: species.length,
    total: null,
    species: [...species].sort(byName),
  }));
  const known = groups.filter((g) => g.family !== null);
  const unknown = groups.filter((g) => g.family === null);
  return [
    ...known.sort((a, b) => (a.family ?? "").localeCompare(b.family ?? "", "de")),
    ...unknown,
  ];
}

export function browsePokedex(caught: readonly CaughtSpecies[], options: BrowseOptions): Browsed {
  const query = lower(options.query.trim());
  const kept = caught.filter((c) => matches(c, query) && keepsFilter(c, options.filter));
  if (options.sort === "family") return { flat: [], groups: group(kept) };
  const order = {
    alphabetical: byName,
    catch_date: byCatchDate,
    species_count: bySpeciesCount,
  }[options.sort];
  return { flat: [...kept].sort(order), groups: [] };
}
