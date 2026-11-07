import { normalize, type Species } from "../../catalog";
import type { SpeciesSource } from "./types";
import type { LightLocation, LightLocationStore, LocationValues } from "../../light";
import type { ImportSpeciesSource, SpeciesCandidate } from "../bulk/types";

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

/** In-memory locations of the keeper for tests only (the real adapter is `db`): names are unique per account, any case. */
export class InMemoryLocations implements LightLocationStore {
  readonly rows: (LightLocation & { userId: string })[] = [];
  private next = 1;

  async list(userId: string): Promise<readonly LightLocation[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .map(({ userId: owner, ...row }) => {
        void owner;
        return row;
      });
  }

  async create(userId: string, values: LocationValues) {
    const taken = this.rows.some(
      (r) => r.userId === userId && r.name.toLowerCase() === values.name.toLowerCase(),
    );
    if (taken) return "name_taken" as const;
    const row = {
      id: `aaaaaaaa-0000-4000-8000-${String(this.next++).padStart(12, "0")}`,
      name: values.name,
      kind: values.kind,
      lightZoneId: values.lightZoneId,
    };
    this.rows.push({ ...row, userId });
    return row;
  }

  async update(): Promise<"not_found"> {
    return "not_found";
  }

  async remove(): Promise<"not_found"> {
    return "not_found";
  }
}

/** The species a name can mean, per account (`only` limits one to one account, FR-BES-11), as the catalog reads answer. */
export class InMemoryImportSpecies implements ImportSpeciesSource {
  constructor(private readonly species: readonly { species: SpeciesCandidate; only?: string }[]) {}

  private visible(userId: string): SpeciesCandidate[] {
    return this.species.filter((s) => !s.only || s.only === userId).map((s) => s.species);
  }

  async exact(userId: string, text: string): Promise<readonly SpeciesCandidate[]> {
    const want = normalize(text);
    if (want === "") return [];
    return this.visible(userId).filter((s) => namesOf(s).some((n) => normalize(n) === want));
  }

  async search(userId: string, text: string) {
    const want = normalize(text);
    const hits = this.visible(userId).filter((s) =>
      namesOf(s).some((n) => normalize(n).includes(want)),
    );
    return { species: hits.slice(0, 50), more: hits.length > 50 };
  }
}

const namesOf = (s: SpeciesCandidate): string[] =>
  [s.latinName, s.germanName, ...s.synonyms].filter((n): n is string => n !== null);
