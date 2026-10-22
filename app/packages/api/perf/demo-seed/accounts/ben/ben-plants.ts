import { SEED_SPECIES } from "../../../catalog-seed/species-list.ts";
import type { LocationDef, SpecimenDef } from "../common/shared.ts";

// Ben (`test2`): a keeper with 50 specimens (#939). 38 of the 51 catalog species (every 4th is left out for
// the others), plus 5 second specimens and 7 cuttings that carry a marker (US-BES-03).
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
    latin: "Sansevieria trifasciata",
    marker: "Klein",
    location: "Schlafzimmer",
    caughtDaysAgo: 210,
  },
  { latin: "Chlorophytum comosum", marker: "Ampel", location: "Bad", caughtDaysAgo: 180 },
  { latin: "Aloe vera", marker: "Zweite", location: "Growbox", caughtDaysAgo: 260 },
  {
    latin: "Philodendron hederaceum",
    marker: "Moosstab",
    location: "Regal mit Pflanzenlampe",
    caughtDaysAgo: 130,
  },
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
  ...(
    [
      ["Syngonium podophyllum", "Steckling", 18],
      ["Tradescantia zebrina", "Ableger", 10],
      ["Hoya carnosa", "Steckling", 30],
      ["Crassula ovata", "Blattsteckling", 60],
    ] as const
  ).map(([latin, marker, caughtDaysAgo]): SpecimenDef => ({
    latin,
    marker,
    status: "cutting",
    location: "Stecklingsbox",
    caughtDaysAgo,
  })),
];

/**
 * Short series for the cuttings (E-11: same measuring interval as plants), by `latin|marker`. The leaf cutting of the
 * Crassula was last measured 45 days ago, so it is overdue with the default interval of 30 days.
 */
export const CUTTING_SERIES: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  "Monstera deliciosa|Ableger": [
    [18, 6],
    [4, 7.5],
  ],
  "Ficus elastica|Steckling": [
    [13, 9],
    [2, 9.5],
  ],
  "Pilea peperomioides|Ableger": [
    [23, 3],
    [9, 3.5],
    [1, 4],
  ],
  "Syngonium podophyllum|Steckling": [
    [16, 12],
    [3, 13],
  ],
  "Tradescantia zebrina|Ableger": [
    [8, 7],
    [1, 8.5],
  ],
  "Hoya carnosa|Steckling": [
    [28, 10],
    [14, 10],
  ],
  "Crassula ovata|Blattsteckling": [
    [55, 1],
    [45, 1.5],
  ],
};

/** Measurement series by specimen index: five points over eight weeks, mostly growing, some standing still. */
export function seriesFor(index: number): readonly (readonly [number, number])[] {
  const start = 8 + (index % 9) * 3;
  const step = index % 5 === 0 ? 0 : 0.5 + (index % 4) * 0.5;
  return [56, 42, 28, 14, 3].map((days, k) => [days, start + step * k] as const);
}
