import type {
  CandidateList,
  Distribution,
  LightLocation,
  LightZone,
  Ownership,
  SpecimenCard,
} from "@pflanzendex/core";

// Fixture data of "Sammlung" (US-QS-14): plants as cards, caught species, the wishlist. Names are German.
const card = (id: string, name: string, species: string, where: [string, string]) =>
  ({
    id,
    name,
    speciesId: `art-${id}`,
    marker: null,
    speciesName: species,
    status: "plant",
    location: where[1],
    lightZone: where[0],
    lightZoneSource: "location",
    caughtAt: "2026-03-12",
    photo: null,
    lastMeasurement: { date: "2026-10-01", value: 24, quality: "healthy", note: null },
    treatment: null,
    moreTreatments: 0,
  }) satisfies SpecimenCard;

const cards: SpecimenCard[] = [
  {
    ...card("a", "Aloe", "Aloe vera", ["Zone 3", "Fensterbank Süd"]),
    treatment: {
      reason: "Läuse",
      dueDate: { kind: "overdue", days: 2, text: "überfällig seit 2 Tagen" },
    },
  },
  card("b", "Monstera", "Monstera deliciosa", ["Zone 2", "Regal Wohnzimmer"]),
  card("c", "Bogenhanf", "Dracaena trifasciata", ["Zone 2", "Regal Wohnzimmer"]),
];

const caught = (id: string, latin: string, german: string, family: string) => ({
  species: latin,
  speciesId: `art-${id}`,
  source: "GBIF",
  genus: latin.split(" ")[0] ?? latin,
  chips: [],
  specimenCount: 1,
  caughtDate: { date: "2026-03-12", source: "caught_at" as const },
  germanName: german,
  familyLatin: family,
  familyGerman: null,
  genusSpeciesCount: null,
});

const ownership: Ownership = {
  caught: [
    caught("a", "Aloe vera", "Echte Aloe", "Asphodelaceae"),
    caught("b", "Monstera deliciosa", "Fensterblatt", "Araceae"),
    caught("c", "Dracaena trifasciata", "Bogenhanf", "Asparagaceae"),
  ],
  unidentified: [],
};

const zone = (id: string, name: string, luxCeiling: number, sortOrder: number): LightZone => ({
  id,
  name,
  luxCeiling,
  ppfd: null,
  sortOrder,
});
const zones = [
  zone("z1", "Zone 1", 20000, 1),
  zone("z2", "Zone 2", 8000, 2),
  zone("z3", "Zone 3", 4000, 3),
];
const locations: LightLocation[] = [
  { id: "l1", name: "Fensterbank Süd", lightZoneId: "z3", kind: "indoor" },
  { id: "l2", name: "Regal Wohnzimmer", lightZoneId: "z2", kind: "indoor" },
];
const distribution: Distribution = {
  zones: [
    { zone: zones[1] as LightZone, count: 2 },
    { zone: zones[2] as LightZone, count: 1 },
  ],
  thinnest: [zones[2] as LightZone],
  notCounted: { cuttingLight: 0, archived: 0, zoneUnknown: 0 },
  hint: { text: "Zone 3 ist am dünnsten besetzt.", nextAction: "Prüfe, ob dort noch Platz ist." },
};

const wish = (
  id: string,
  name: string,
  german: string,
  stock: number,
): CandidateList["candidates"][number] => ({
  id,
  name,
  german,
  title: `${german} (${name})`,
  zone: { id: "z3", name: "Zone 3" },
  stock,
  zoneText: `Zone 3 — ${stock} Pflanzen`,
  difficulty: 2,
  reasoning: null,
  image: null,
  priority: { kind: "thinnest", text: "Zone 3 hat die wenigsten Pflanzen." },
});
const candidates: CandidateList = {
  candidates: [
    wish("w1", "Haworthia fasciata", "Zebra-Haworthie", 1),
    wish("w2", "Sansevieria cylindrica", "Rundblättriger Bogenhanf", 1),
  ],
  zones: [{ zoneId: "z3", name: "Zone 3", count: 1 }],
  hint: { text: "Zwei Kandidaten warten.", nextAction: "Kaufe zuerst für die dünnste Zone." },
  duplicates: [],
  duplicateHint: null,
  replenishment: {
    buffer: 3,
    zones: [],
    actions: { discover: true, suggestions: false },
    nextAction: null,
  },
};

export const collectionRoutes = {
  "/specimens/cards": { cards },
  "/specimens/count": { count: 3, archived: 0 },
  "/specimens/archived": { archived: [] },
  "/specimens/distribution": { distribution },
  "/locations": { locations },
  "/light-zones": { zones },
  "/pokedex/ownership": { ownership },
  "/pokedex/seen": { seen: null },
  "/pokedex/cards": { cards: [] },
  "/wishes/candidates": candidates,
  "/wishes/bought": {
    bought: [],
    hint: {
      text: "Noch kein Wunsch ist als gekauft vermerkt.",
      nextAction: "Hast du einen Kandidaten gekauft, tippe bei ihm auf „Gekauft“.",
    },
  },
  "/wishes/discarded": {
    discarded: [],
    hint: {
      text: "Kein Wunsch ist verworfen.",
      nextAction: "Ein verworfener Wunsch bleibt zur Erinnerung gespeichert.",
    },
  },
};

/** A new account: no plants, species or wishes yet; every mode says what to do first (P-09). */
export const collectionEmpty = {
  ...collectionRoutes,
  "/specimens/cards": { cards: [] },
  "/specimens/count": { count: 0, archived: 0 },
  "/pokedex/ownership": { ownership: { caught: [], unidentified: [] } },
  "/wishes/candidates": { ...candidates, candidates: [] },
};
