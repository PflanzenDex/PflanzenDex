import type { Species } from "../catalog";
import type {
  SpeciesSource,
  SpecimenStore,
  SpecimenValues,
  SpecimenRow,
  TargetLocationSource,
} from "./types";

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
}

/** In-memory adapter for tests only; the real adapter lives in `db`. Known locations replace the foreign key. */
export class InMemorySpecimens implements SpecimenStore {
  readonly rows: (SpecimenRow & { userId: string })[] = [];
  writes = 0;

  constructor(private readonly locations: Readonly<Record<string, readonly string[]>> = {}) {}

  async list(userId: string): Promise<readonly SpecimenRow[]> {
    return this.rows
      .filter((z) => z.userId === userId)
      .map((z) => {
        const { userId: owner, ...row } = z;
        void owner;
        return row;
      });
  }

  async find(userId: string, id: string): Promise<SpecimenRow | null> {
    return (await this.list(userId)).find((z) => z.id === id) ?? null;
  }

  async create(
    userId: string,
    w: SpecimenValues,
  ): Promise<SpecimenRow | "name_taken" | "location_unknown"> {
    this.writes += 1;
    const taken = this.rows.some(
      (z) => z.userId === userId && z.name.toLowerCase() === w.name.toLowerCase(),
    );
    if (taken) return "name_taken";
    if (w.locationId && !this.locations[userId]?.includes(w.locationId)) return "location_unknown";
    const row: SpecimenRow = {
      ...w,
      id: `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, "0")}`,
      status: w.status ?? "plant",
      archivedAt: null,
      archivedReason: null,
    };
    this.rows.push({ ...row, userId });
    return row;
  }

  /** Status before the archiving per row (the real adapter keeps it in a column). */
  private readonly before = new Map<string, SpecimenRow["status"]>();

  private replace(userId: string, id: string, fresh: Partial<SpecimenRow>) {
    const i = this.rows.findIndex((z) => z.userId === userId && z.id === id);
    const alt = this.rows[i];
    if (!alt) return null;
    this.writes += 1;
    const row = { ...alt, ...fresh };
    this.rows[i] = row;
    const { userId: owner, ...without } = row;
    void owner;
    return without;
  }

  async archive(userId: string, id: string, reason: string, date: string) {
    const z = await this.find(userId, id);
    if (!z) return "not_found" as const;
    if (z.status === "archived") return "already_archived" as const;
    this.before.set(id, z.status);
    const r = this.replace(userId, id, {
      status: "archived",
      archivedAt: date,
      archivedReason: reason,
    });
    return r as SpecimenRow;
  }

  async repot(userId: string, id: string) {
    const z = await this.find(userId, id);
    if (!z) return "not_found" as const;
    if (z.status !== "cutting") return "not_a_cutting" as const;
    return this.replace(userId, id, { status: "plant" }) as SpecimenRow;
  }

  async restore(userId: string, id: string) {
    const z = await this.find(userId, id);
    if (!z) return "not_found" as const;
    if (z.status !== "archived") return "not_archived" as const;
    const r = this.replace(userId, id, {
      status: this.before.get(id) ?? "plant",
      archivedAt: null,
      archivedReason: null,
    });
    return r as SpecimenRow;
  }
}

/** Target-location stub: remembers the calls so tests can check what the port learns. */
export class TargetLocationStub implements TargetLocationSource {
  readonly calls: { userId: string; speciesId: string; today: string }[] = [];
  readonly growthCalls: { userId: string; speciesId: string }[] = [];

  constructor(
    private readonly response: string | null,
    private readonly growth: string | null = null,
  ) {}

  async growthLocation(userId: string, species: Species): Promise<string | null> {
    this.growthCalls.push({ userId, speciesId: species.id });
    return this.growth;
  }

  async targetLocation(userId: string, species: Species, today: string): Promise<string | null> {
    this.calls.push({ userId, speciesId: species.id, today });
    return this.response;
  }
}
