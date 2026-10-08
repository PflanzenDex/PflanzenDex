import type { SpeciesHit, Suggestion, SuggestionDeck } from "@pflanzendex/core";

// Fixture data of "Entdecken" (US-QS-14): swipe suggestions and the species catalog. No image is loaded (no network).
const suggestion = (
  species: string,
  german: string,
  level: { zone: number; difficulty: number },
  reason: string,
): Suggestion => ({
  species,
  germanName: german,
  summary: `${german} ist eine robuste Zimmerpflanze.`,
  summaryLanguage: "de",
  family: "Asphodelaceae",
  lightZone: level.zone,
  difficulty: level.difficulty,
  imageUrl: null,
  sourceUrl: "https://de.wikipedia.org/wiki/Zimmerpflanze",
  attributes: { humidity: null, minTemperature: null, toxicToPets: null, growthSize: null },
  reasons: [reason],
});

const deck: SuggestionDeck = {
  deck: 1,
  empty: null,
  suggestions: [
    suggestion(
      "Haworthia fasciata",
      "Zebra-Haworthie",
      { zone: 3, difficulty: 1 },
      "Zone 3 hat die wenigsten Pflanzen.",
    ),
    suggestion(
      "Gasteria carinata",
      "Ochsenzunge",
      { zone: 3, difficulty: 2 },
      "Passt zu deinen Sukkulenten.",
    ),
  ],
};

const hit = (id: string, latin: string, german: string): SpeciesHit => ({
  id,
  reviewStatus: "reviewed",
  createdBy: "operator",
  own: false,
  version: 1,
  latinName: latin,
  genus: latin.split(" ")[0] ?? latin,
  epithet: latin.split(" ")[1] ?? null,
  cultivar: null,
  germanName: german,
  englishName: null,
  synonyms: [],
  familyGerman: null,
  familyLatin: "Asphodelaceae",
  difficulty: 1,
  standardLevel: 3,
  lightDemandLux: 8000,
  dormancyFrom: null,
  dormancyUntil: null,
  locationHint: null,
  growthMeasure: "rosette_diameter",
  etiolationSigns: "Die Rosette streckt sich und wird locker.",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "Kompakte Rosette mit festen Blättern.",
  botanicalStory: null,
  source: "GBIF",
  hit: null,
});

export const discoverRoutes = {
  "/discover/suggestions": deck,
  "/species": {
    species: [
      hit("art-a", "Aloe vera", "Echte Aloe"),
      hit("art-h", "Haworthia fasciata", "Zebra-Haworthie"),
      hit("art-g", "Gasteria carinata", "Ochsenzunge"),
    ],
  },
  "/pokedex/ownership": { ownership: { caught: [], unidentified: [] } },
};

/** Every suggestion was decided: the deck says so and offers the way on (P-09). */
export const discoverEmpty = {
  ...discoverRoutes,
  "/discover/suggestions": {
    deck: 1,
    suggestions: [],
    empty: {
      reason: "all_decided",
      text: "Du hast alle Vorschläge entschieden.",
      nextAction: "Schau in den Katalog oder in deine Wunschliste.",
    },
  },
};
