// Ownership of species ("gefangen") derived from the specimens (US-POK-06, P-01): nothing is stored. Caught means at
// least one active specimen of the account refers to the species (the same `isActive` rule as everywhere,
// US-BES-07). A specimen without an epithet or with an unreadable species does not count, but is named with what fixes
// it instead of vanishing (P-09, P-10). Only the data of the account flows in (P-04).
import type { Species } from "../catalog";
import { isActive, type SpecimenRow } from "../collection";
import { earliest, specimenCatchDate } from "./catch-date";
import { speciesKey } from "./species-key";
import type {
  CatchDate,
  CaughtSpecies,
  Ownership,
  OwnershipDependencies,
  UnidentifiedSpecimen,
} from "./types";

const NEXT_ACTION = "Bestimme die Art, dann zählt es.";

const unidentified = (z: SpecimenRow, latinName: string | null): UnidentifiedSpecimen => ({
  specimenId: z.id,
  specimenName: z.name,
  latinName,
  text:
    latinName === null
      ? `Die Art von „${z.name}“ ist nicht lesbar, das Exemplar zählt noch nicht.`
      : `„${z.name}“ (${latinName}) hat noch keine bestimmte Art, das Exemplar zählt noch nicht.`,
  nextAction: NEXT_ACTION,
});

/** Species per species ID for the account (unreadable species are `null`). */
async function readSpecies(
  deps: OwnershipDependencies,
  userId: string,
  rows: readonly SpecimenRow[],
) {
  const ids = [...new Set(rows.map((z) => z.speciesId))];
  const read = await Promise.all(ids.map((id) => deps.species.find(userId, id)));
  return new Map(ids.map((id, i) => [id, read[i] ?? null] as const));
}

/** German name, family and source shown on the card and in the details. */
interface Details {
  source: string | null;
  germanName: string | null;
  familyLatin: string | null;
  familyGerman: string | null;
}
/** Known values win over unknown ones; the plain species (no cultivar chip) wins over a cultivar, so the order of the specimens does not matter. */
const merged = (have: Details, s: Species, plain: boolean): Details => {
  const [first, second] = plain ? [s, have] : [have, s];
  return {
    source: first.source ?? second.source,
    germanName: first.germanName ?? second.germanName,
    familyLatin: first.familyLatin ?? second.familyLatin,
    familyGerman: first.familyGerman ?? second.familyGerman,
  };
};

const NONE: Details = { source: null, germanName: null, familyLatin: null, familyGerman: null };

/** Catch date per species key across ALL specimens, archived too (US-POK-07). */
function catchDates(
  all: readonly SpecimenRow[],
  read: ReadonlyMap<string, Species | null>,
  timeZone: string,
): Map<string, CatchDate> {
  const per = new Map<string, CatchDate[]>();
  for (const z of all) {
    const name = read.get(z.speciesId)?.latinName ?? null;
    const species = name === null ? null : speciesKey(name).species;
    if (species === null) continue;
    per.set(species, [...(per.get(species) ?? []), specimenCatchDate(z, timeZone)]);
  }
  return new Map([...per].map(([species, dates]) => [species, earliest(dates)]));
}

interface Entry extends Details {
  /** The plain species (no cultivar chip) represents the card; a cultivar only until a plain one shows up. */
  speciesId: string;
  plain: boolean;
  genus: string;
  chips: Set<string>;
  count: number;
}

/** The key of a species that can be caught: with both genus and epithet (US-POK-06); otherwise `null`. */
function countable(row: Species | null) {
  const key = row === null ? null : speciesKey(row.latinName);
  return key !== null && key.species !== null && key.genus !== null
    ? { species: key.species, genus: key.genus, chip: key.chip }
    : null;
}

/** The entry of a species after one more specimen of `row` joined it. */
function addSpecimen(
  have: Entry | undefined,
  row: Species,
  key: { genus: string; chip: string | null },
): Entry {
  const entry = have ?? {
    ...NONE,
    speciesId: row.id,
    plain: false,
    genus: key.genus,
    chips: new Set(),
    count: 0,
  };
  if (key.chip !== null) entry.chips.add(key.chip);
  return {
    ...entry,
    ...merged(entry, row, key.chip === null),
    speciesId: key.chip === null && !entry.plain ? row.id : entry.speciesId,
    plain: entry.plain || key.chip === null,
    count: entry.count + 1,
  };
}

/** Splits the active specimens into caught species (by key) and the ones that cannot count yet (P-10). */
function collect(rows: readonly SpecimenRow[], read: ReadonlyMap<string, Species | null>) {
  const caught = new Map<string, Entry>();
  const open: UnidentifiedSpecimen[] = [];
  for (const z of rows) {
    const row = read.get(z.speciesId) ?? null;
    const key = countable(row);
    if (row === null || key === null) {
      open.push(unidentified(z, row?.latinName ?? null));
      continue;
    }
    caught.set(key.species, addSpecimen(caught.get(key.species), row, key));
  }
  return { caught, open };
}

export async function pokedexOwnership(
  deps: OwnershipDependencies,
  userId: string,
  timeZone: string,
): Promise<Ownership> {
  const all = await deps.specimens.list(userId);
  const read = await readSpecies(deps, userId, all);
  const dates = catchDates(all, read, timeZone);
  const { caught, open } = collect(all.filter(isActive), read);
  const byName = (a: string, b: string) => a.localeCompare(b, "de");
  const list: CaughtSpecies[] = [...caught]
    .map(([species, e]) => ({
      species,
      speciesId: e.speciesId,
      source: e.source,
      genus: e.genus,
      chips: [...e.chips].sort(byName),
      specimenCount: e.count,
      caughtDate: dates.get(species) ?? { date: null, source: "unknown" as const },
      germanName: e.germanName,
      familyLatin: e.familyLatin,
      familyGerman: e.familyGerman,
      genusSpeciesCount: null,
    }))
    .sort((a, b) => byName(a.species, b.species));
  return {
    caught: list,
    unidentified: open.sort((a, b) => byName(a.specimenName, b.specimenName)),
  };
}
