import type {
  Species,
  SpeciesCreation,
  SpeciesName,
  SpeciesStore,
  SpeciesHit,
  SpeciesValues,
} from "./types";

const RANK = { latin: 0, german: 1, english: 2, synonym: 3 } as const;

type Row = Species & { creator: string; names: readonly SpeciesName[] };

/** In-memory adapter for tests only; the real adapter lives in `db`. Visibility as in FR-BES-11. */
export class InMemorySpecies implements SpeciesStore {
  readonly rows: Row[] = [];

  /** Simulates approval by a reviewer (BES-10): the species is then visible to everyone. */
  approve(id: string): void {
    const i = this.rows.findIndex((z) => z.id === id);
    const z = this.rows[i];
    if (z) this.rows[i] = { ...z, reviewStatus: "reviewed" };
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

  async search(userId: string, norm: string | null): Promise<readonly SpeciesHit[]> {
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
    return hit.sort((a, b) => a.latinName.localeCompare(b.latinName));
  }

  async find(userId: string, id: string): Promise<Species | null> {
    const z = this.visible(userId).find((x) => x.id === id);
    return z ? this.asValue(userId, z) : null;
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
