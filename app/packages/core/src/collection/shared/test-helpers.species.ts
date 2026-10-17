import type { Species } from "../../catalog";
import type { SpeciesSource } from "./types";

/** A complete species for tests of `collection` (test data only, no product code). */
export const testSpecies = (id: string, extra: Partial<Species> = {}): Species => ({
  id,
  latinName: "Dracaena trifasciata",
  genus: "Dracaena",
  epithet: "trifasciata",
  cultivar: null,
  germanName: "Bogenhanf",
  englishName: null,
  synonyms: [],
  familyGerman: null,
  familyLatin: null,
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  softLeaf: false,
  dormancyFrom: null,
  dormancyUntil: null,
  locationHint: null,
  growthMeasure: "height",
  etiolationSigns: "Blätter werden schmal.",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "Neue Blätter wachsen aufrecht.",
  botanicalStory: null,
  source: null,
  reviewStatus: "reviewed",
  createdBy: "operator",
  own: false,
  version: 1,
  ...extra,
});

/** Species with visibility per account: `only` limits a species to one account (private proposal, FR-BES-11). */
export class SpeciesStub implements SpeciesSource {
  constructor(private readonly species: readonly { species: Species; only?: string }[]) {}

  async find(userId: string, id: string): Promise<Species | null> {
    return (
      this.species.find((a) => a.species.id === id && (!a.only || a.only === userId))?.species ??
      null
    );
  }

  async findMany(userId: string, ids: readonly string[]) {
    return Promise.all(ids.map((id) => this.find(userId, id)));
  }
}
