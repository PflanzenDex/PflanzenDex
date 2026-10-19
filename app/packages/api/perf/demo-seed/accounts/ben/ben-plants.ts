import { SEED_SPECIES } from "../../../catalog-seed/species-list.ts";
import type { LocationDef, SpecimenDef } from "../common/shared.ts";

// Ben (`test2`): a keeper with about 40 specimens. 38 of the 51 catalog species (every 4th is left out for
// the others), plus second specimens and cuttings that carry a marker (US-BES-03).
export const BEN_LOCATIONS: readonly LocationDef[] = [
  { name: "Schlafzimmer", zone: "Lampe 2" },
  { name: "Bad", zone: "Lampe 2" },
  { name: "Wohnzimmer Fenster", zone: "Lampe 3" },
  { name: "Regal mit Pflanzenlampe", zone: "Lampe 3" },
  { name: "Growbox", zone: "Lampe 4" },
  { name: "Balkon", zone: "Lampe 4", kind: "outdoor" },
  { name: "Stecklingsbox", zone: "Lampe 1" },
];
const BY_LEVEL: Record<number, readonly string[]> = {
  2: ["Schlafzimmer", "Bad", "Regal mit Pflanzenlampe"],
  3: ["Wohnzimmer Fenster", "Regal mit Pflanzenlampe"],
  4: ["Growbox", "Balkon", "Wohnzimmer Fenster"],
};

const OWNED = SEED_SPECIES.filter((_, i) => i % 4 !== 0);

export const BEN_SPECIMENS: readonly SpecimenDef[] = [
  ...OWNED.map((row, i): SpecimenDef => {
    const spots = BY_LEVEL[row[6]] ?? BY_LEVEL[3] ?? [];
    return {
      latin: row[0],
      location: spots[i % spots.length] ?? "Schlafzimmer",
      caughtDaysAgo: 400 - i * 9,
    };
  }),
  { latin: "Epipremnum aureum", marker: "Ampel", location: "Bad", caughtDaysAgo: 150 },
  {
    latin: "Monstera deliciosa",
    marker: "Ableger",
    status: "cutting",
    location: "Stecklingsbox",
    caughtDaysAgo: 20,
  },
  {
    latin: "Ficus elastica",
    marker: "Steckling",
    status: "cutting",
    location: "Stecklingsbox",
    caughtDaysAgo: 15,
  },
  {
    latin: "Pilea peperomioides",
    marker: "Ableger",
    status: "cutting",
    location: "Stecklingsbox",
    caughtDaysAgo: 25,
  },
];

/** Measurement series by specimen index: five points over eight weeks, mostly growing, some standing still. */
export function seriesFor(index: number): readonly (readonly [number, number])[] {
  const start = 8 + (index % 9) * 3;
  const step = index % 5 === 0 ? 0 : 0.5 + (index % 4) * 0.5;
  return [56, 42, 28, 14, 3].map((days, k) => [days, start + step * k] as const);
}
