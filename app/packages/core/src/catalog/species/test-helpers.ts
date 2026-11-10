import type {
  Species,
  SpeciesCreation,
  SpeciesName,
  SpeciesSearch,
  SpeciesStore,
  SpeciesHit,
  SpeciesValues,
} from "./types";

import type { ApprovedDuplicate, ApprovedTwin } from "../types";

const RANK = { latin: 0, german: 1, english: 2, synonym: 3 } as const;

type Row = Species & { creator: string; names: readonly SpeciesName[] };

const isApproved = (z: Row) => z.reviewStatus === "curated" || z.reviewStatus === "reviewed";
const latinKeyOf = (z: Row) => z.names.find((n) => n.field === "latin")?.norm ?? "";

/** In-memory adapter for tests only; the real adapter lives in `db`. Visibility as in FR-BES-11. */
export class InMemorySpecies implements SpeciesStore {
  readonly rows: Row[] = [];
  /** `cap` simulates the visible cap of the search (FR-BES-24); without it the fake shows every match. */
  constructor(private readonly cap = Number.POSITIVE_INFINITY) {}

  /** Simulates approval by a reviewer (BES-10): the species is then visible to everyone. */
  approve(id: string): void {
    const i = this.rows.findIndex((z) => z.id === id);
    const z = this.rows[i];
    if (z) this.rows[i] = { ...z, reviewStatus: "reviewed" };
  }

  /** The approved species that holds this Latin name key, other than `exceptId` (the approval check, US-BES-10). */
  approvedTwin(key: string, exceptId: string): ApprovedTwin | null {
    const z = this.rows.find((x) => x.id !== exceptId && isApproved(x) && latinKeyOf(x) === key);
    return z ? { id: z.id, latinName: z.latinName } : null;
  }

  /** The Latin names that two or more approved species hold, each with its species (the duplicates, US-BES-10). */
  approvedDuplicates(): ApprovedDuplicate[] {
    const groups = new Map<string, Row[]>();
    for (const z of this.rows.filter(isApproved)) {
      const key = latinKeyOf(z);
      groups.set(key, [...(groups.get(key) ?? []), z]);
    }
    return [...groups.values()]
      .filter((g) => g.length > 1)
      .map((g) => {
        const species = g
          .map((z) => ({ id: z.id, latinName: z.latinName }))
          .sort((a, b) => a.latinName.localeCompare(b.latinName) || a.id.localeCompare(b.id));
        return { latinName: species[0]?.latinName ?? "", species };
      })
      .sort((a, b) => a.latinName.localeCompare(b.latinName));
  }

  private visible(userId: string): Row[] {
    return this.rows.filter(
      (z) =>
        z.reviewStatus !== "merged" &&
        (z.creator === userId || ["curated", "reviewed"].includes(z.reviewStatus)),
    );
  }

  private asValue(userId: string, z: Row): Species {
    const { creator, names, ...species } = z;
    void names;
    return { ...species, own: creator === userId };
  }

  async search(userId: string, norm: string | null): Promise<SpeciesSearch> {
    const hit: SpeciesHit[] = [];
    for (const z of this.visible(userId)) {
      const matching = z.names
        .filter((n) => norm === null || n.norm.includes(norm))
        .sort((a, b) => RANK[a.field] - RANK[b.field])[0];
      if (norm === null || matching)
        hit.push({
          ...this.asValue(userId, z),
          hit: matching ? { field: matching.field, display: matching.display } : null,
        });
    }
    const all = hit.sort((a, b) => a.latinName.localeCompare(b.latinName));
    return { species: all.slice(0, this.cap), more: all.length > this.cap };
  }

  /** Like the adapter: a name equal to `norm` as a whole, no cap (FR-BES-24). */
  async exact(userId: string, norm: string): Promise<SpeciesHit[]> {
    const hit: SpeciesHit[] = [];
    for (const z of this.visible(userId)) {
      const matching = z.names
        .filter((n) => n.norm === norm)
        .sort((a, b) => RANK[a.field] - RANK[b.field])[0];
      if (matching)
        hit.push({
          ...this.asValue(userId, z),
          hit: { field: matching.field, display: matching.display },
        });
    }
    return hit.sort((a, b) => a.latinName.localeCompare(b.latinName));
  }

  async find(userId: string, id: string): Promise<Species | null> {
    const z = this.visible(userId).find((x) => x.id === id);
    return z ? this.asValue(userId, z) : null;
  }

  async findMany(userId: string, ids: readonly string[]) {
    return Promise.all(ids.map((id) => this.find(userId, id)));
  }

  /** Roles for `findForReview` (reviewers see foreign proposals). */
  reviewers: string[] = [];

  async findForReview(userId: string, id: string): Promise<Species | null> {
    const z = this.rows.find(
      (x) => x.id === id && (this.reviewers.includes(userId) || this.visible(userId).includes(x)),
    );
    return z && z.reviewStatus !== "merged" ? this.asValue(userId, z) : null;
  }

  async create(
    userId: string,
    w: SpeciesValues,
    names: readonly SpeciesName[],
  ): Promise<SpeciesCreation> {
    const key = new Set(names.filter((n) => n.field !== "german" && n.field !== "english"));
    const present = this.visible(userId).find((z) =>
      z.names.some(
        (n) =>
          (n.field === "latin" || n.field === "synonym") && [...key].some((s) => s.norm === n.norm),
      ),
    );
    if (present) return { kind: "duplicate", value: this.asValue(userId, present) };
    const id = `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, "0")}`;
    const row: Row = {
      ...w,
      id,
      reviewStatus: "proposal",
      createdBy: "user",
      own: true,
      version: 1,
      creator: userId,
      names,
    };
    this.rows.push(row);
    return { kind: "fresh", value: this.asValue(userId, row) };
  }
}
