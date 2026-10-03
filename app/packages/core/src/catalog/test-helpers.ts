import type { ReviewStatus, ReviewCase, ReviewStore, Role } from "./types";

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
    };
    this.rows.push(row);
    return row;
  }

  async find(userId: string, id: string): Promise<ReviewCase | null> {
    const reviewer = (await this.roles(userId)).length > 0;
    return this.rows.find((z) => z.id === id && (reviewer || z.creatorId === userId)) ?? null;
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
}
