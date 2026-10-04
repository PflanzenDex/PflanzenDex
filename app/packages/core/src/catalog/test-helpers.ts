import { execute, type Operation } from "../kernel";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { speciesPropose } from "./species/propose";
import { InMemorySpecies } from "./species/test-helpers";
import { catalogPropose } from "./propose";
import {
  OPEN,
  type MergeMoved,
  type MergeOutcome,
  type ReviewStatus,
  type ReviewCase,
  type ReviewStore,
  type Role,
} from "./types";

/** In-memory adapter for tests only; the real adapter lives in `db`. */
export class InMemoryReview implements ReviewStore {
  readonly rows: ReviewCase[] = [];
  constructor(private readonly rolePerUser: Record<string, Role[]> = {}) {}

  async roles(userId: string): Promise<readonly Role[]> {
    return this.rolePerUser[userId] ?? [];
  }

  async create(
    userId: string,
    v: { objectKind: string; objectId: string; status: ReviewStatus },
  ): Promise<ReviewCase | "present"> {
    if (this.rows.some((z) => z.objectKind === v.objectKind && z.objectId === v.objectId)) {
      return "present";
    }
    const no = String(this.rows.length).padStart(12, "0");
    const row: ReviewCase = {
      id: `00000000-0000-4000-8000-${no}`,
      creatorId: userId,
      ...v,
      reason: null,
      reviewedBy: v.status === "curated" ? userId : null,
      createdAt: `2026-10-0${(this.rows.length % 9) + 1}T08:00:00Z`,
      mergedInto: null,
    };
    this.rows.push(row);
    return row;
  }

  async find(userId: string, id: string): Promise<ReviewCase | null> {
    const reviewer = (await this.roles(userId)).length > 0;
    return this.rows.find((z) => z.id === id && (reviewer || z.creatorId === userId)) ?? null;
  }

  async listForReview(userId: string): Promise<readonly ReviewCase[]> {
    return (await this.roles(userId)).length > 0
      ? this.rows.filter(
          (z) => z.status !== "rejected" && z.status !== "reviewed" && z.status !== "merged",
        )
      : [];
  }

  async decide(
    userId: string,
    id: string,
    status: "reviewed" | "rejected",
    reason: string | null,
  ): Promise<ReviewCase | null> {
    const i = this.rows.findIndex((z) => z.id === id);
    const alt = this.rows[i];
    if (!alt) return null;
    const fresh = { ...alt, status, reason, reviewedBy: userId };
    this.rows[i] = fresh;
    return fresh;
  }

  /** Re-pointing results the merge reports; tests set it to simulate the other modules' ports. */
  moved: MergeMoved[] = [{ kind: "specimen", moved: 1, kept: 0 }];
  conflict = false;

  async merge(
    userId: string,
    proposalId: string,
    targetSpeciesId: string,
  ): Promise<MergeOutcome | "conflict" | null> {
    const i = this.rows.findIndex((z) => z.id === proposalId);
    const existing = this.rows[i];
    if (!existing || !OPEN.includes(existing.status)) return null;
    if (this.conflict) return "conflict";
    const merged: ReviewCase = {
      ...existing,
      status: "merged",
      mergedInto: targetSpeciesId,
      reviewedBy: userId,
    };
    this.rows[i] = merged;
    return { reviewCase: merged, moved: this.moved };
  }
}

/** Two plant keepers, an operator and a reviewer share one catalog; used by the review tests (US-BES-10). */
export const FULL = {
  latinName: "Dracaena trifasciata",
  germanName: "Bogenhanf",
  synonyms: ["Sansevieria trifasciata"],
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  growthMeasure: "height",
  etiolationSigns: "Blätter werden schmal und kippen zur Seite.",
  successCriteria: "Neue Blätter wachsen aufrecht und kräftig gefärbt.",
  source: "RHS",
};

export class ReviewWorld {
  readonly species = new InMemorySpecies();
  readonly reviews = new InMemoryReview({ operator: ["operator"], reviewer: ["reviewer"] });
  private readonly idem = new InMemoryIdempotencyStore();
  private counter = 0;

  constructor() {
    this.species.reviewers.push("operator", "reviewer");
  }

  call<E, A>(op: Operation<E, A>, userId: string | null, input: unknown) {
    return execute(
      op,
      { idempotency: this.idem },
      { context: { userId }, input, idempotencyKey: `k${++this.counter}` },
    );
  }

  /** The keeper proposes a species; returns species id and review case id (both created like the adapter does). */
  async proposeSpecies(userId: string, values: Record<string, unknown> = FULL) {
    const s = await this.call(speciesPropose(this.species), userId, values);
    if (!s.ok) throw new Error(`species.propose failed: ${s.error.code}`);
    const c = await this.call(catalogPropose(this.reviews), userId, {
      objectKind: "species",
      objectId: s.value.id,
      status: "proposal",
    });
    if (!c.ok) throw new Error(`catalog.propose failed: ${c.error.code}`);
    return { speciesId: s.value.id, caseId: c.value.id };
  }

  /** An approved species (operator batch). */
  async approvedSpecies(values: Record<string, unknown>) {
    const p = await this.proposeSpecies("operator", values);
    this.species.approve(p.speciesId);
    const i = this.reviews.rows.findIndex((z) => z.id === p.caseId);
    const row = this.reviews.rows[i];
    if (row) this.reviews.rows[i] = { ...row, status: "reviewed" };
    return p;
  }
}
