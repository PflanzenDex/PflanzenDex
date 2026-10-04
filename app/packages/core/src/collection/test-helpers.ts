import type { Species } from "../catalog";
import type {
  SpeciesSource,
  SpecimenStore,
  SpecimenValues,
  MarkerAssignment,
  LocationAssignment,
  SpecimenRow,
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

  private markerTaken(userId: string, speciesId: string, marker: string, except: string[] = []) {
    return this.rows.some(
      (z) =>
        z.userId === userId &&
        z.speciesId === speciesId &&
        !except.includes(z.id) &&
        z.marker?.toLowerCase() === marker.toLowerCase(),
    );
  }

  /** Why the new specimen and the renames cannot be written together (the real adapter has constraints). */
  private conflict(
    userId: string,
    w: SpecimenValues,
    assignments: readonly MarkerAssignment[],
  ): "name_taken" | "marker_taken" | "specimen_unknown" | null {
    const ids = assignments.map((a) => a.specimenId);
    if (ids.some((id) => !this.rows.some((z) => z.userId === userId && z.id === id)))
      return "specimen_unknown";
    const names = [w.name, ...assignments.map((a) => a.name)].map((n) => n.toLowerCase());
    const taken = this.rows.some(
      (z) => z.userId === userId && !ids.includes(z.id) && names.includes(z.name.toLowerCase()),
    );
    if (taken || new Set(names).size < names.length) return "name_taken";
    const markers = [w.marker, ...assignments.map((a) => a.marker)];
    const own = markers.filter((m): m is string => m !== null).map((m) => m.toLowerCase());
    const clash = markers.some((m) => m && this.markerTaken(userId, w.speciesId, m, ids));
    return new Set(own).size < own.length || clash ? "marker_taken" : null;
  }

  async create(
    userId: string,
    w: SpecimenValues,
    assignments: readonly MarkerAssignment[] = [],
  ): Promise<
    SpecimenRow | "name_taken" | "marker_taken" | "location_unknown" | "specimen_unknown"
  > {
    this.writes += 1;
    const conflict = this.conflict(userId, w, assignments);
    if (conflict) return conflict;
    if (w.locationId && !this.locations[userId]?.includes(w.locationId)) return "location_unknown";
    for (const a of assignments)
      this.replace(userId, a.specimenId, { name: a.name, marker: a.marker });
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

  async mark(userId: string, id: string, w: { name: string; marker: string }) {
    const z = await this.find(userId, id);
    if (!z) return "not_found" as const;
    if (z.status === "archived") return "archived" as const;
    if (this.markerTaken(userId, z.speciesId, w.marker, [id])) return "marker_taken" as const;
    const name = w.name.toLowerCase();
    if (this.rows.some((r) => r.userId === userId && r.id !== id && r.name.toLowerCase() === name))
      return "name_taken" as const;
    return this.replace(userId, id, { name: w.name, marker: w.marker }) as SpecimenRow;
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
    return this.replace(userId, id, {
      status: "archived",
      archivedAt: date,
      archivedReason: reason,
    }) as SpecimenRow;
  }

  async repot(userId: string, id: string) {
    const z = await this.find(userId, id);
    if (!z) return "not_found" as const;
    if (z.status !== "cutting") return "not_a_cutting" as const;
    return this.replace(userId, id, { status: "plant" }) as SpecimenRow;
  }

  async setLocations(userId: string, assignments: readonly LocationAssignment[]) {
    const rows = await Promise.all(assignments.map((a) => this.find(userId, a.specimenId)));
    if (rows.includes(null)) return "specimen_unknown" as const;
    if (rows.some((z) => z?.status === "archived")) return "archived" as const;
    const known = (id: string) => this.locations[userId]?.includes(id);
    if (!assignments.every((a) => known(a.locationId))) return "location_unknown" as const;
    const set = (a: LocationAssignment) =>
      this.replace(userId, a.specimenId, { locationId: a.locationId }) as SpecimenRow;
    return assignments.map(set);
  }

  async restore(userId: string, id: string) {
    const z = await this.find(userId, id);
    if (!z) return "not_found" as const;
    if (z.status !== "archived") return "not_archived" as const;
    return this.replace(userId, id, {
      status: this.before.get(id) ?? "plant",
      archivedAt: null,
      archivedReason: null,
    }) as SpecimenRow;
  }
}

export { TargetLocationStub } from "./target-location-stub";
