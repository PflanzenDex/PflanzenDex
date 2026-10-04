// Ownership of species ("gefangen") derived from the specimens (US-POK-06, P-01): nothing is stored. Caught means at
// least one active specimen of the account refers to the species (the same `isActive` rule as everywhere,
// US-BES-07). A specimen without an epithet or with an unreadable species does not count, but is named with what fixes
// it instead of vanishing (P-09, P-10). Only the data of the account flows in (P-04).
import { isActive, type SpecimenRow } from "../collection";
import { speciesKey } from "./species-key";
import type {
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

export async function pokedexOwnership(
  deps: OwnershipDependencies,
  userId: string,
): Promise<Ownership> {
  const rows = (await deps.specimens.list(userId)).filter(isActive);
  const ids = [...new Set(rows.map((z) => z.speciesId))];
  const read = await Promise.all(ids.map((id) => deps.species.find(userId, id)));
  const latin = new Map(ids.map((id, i) => [id, read[i]?.latinName ?? null] as const));
  const caught = new Map<string, { genus: string; chips: Set<string>; count: number }>();
  const open: UnidentifiedSpecimen[] = [];
  for (const z of rows) {
    const name = latin.get(z.speciesId) ?? null;
    const key = name === null ? null : speciesKey(name);
    if (key === null || key.species === null || key.genus === null) {
      open.push(unidentified(z, name));
      continue;
    }
    const entry = caught.get(key.species) ?? {
      genus: key.genus,
      chips: new Set<string>(),
      count: 0,
    };
    if (key.chip !== null) entry.chips.add(key.chip);
    entry.count += 1;
    caught.set(key.species, entry);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, "de");
  const list: CaughtSpecies[] = [...caught]
    .map(([species, e]) => ({
      species,
      genus: e.genus,
      chips: [...e.chips].sort(byName),
      specimenCount: e.count,
    }))
    .sort((a, b) => byName(a.species, b.species));
  return {
    caught: list,
    unidentified: open.sort((a, b) => byName(a.specimenName, b.specimenName)),
  };
}
