import type { LeafRow, LeafStore, LeafValues } from "../leaves/types";

// Test helper for the leaf log (US-WAC-07) only; the real adapter lives in `db`.
/** In-memory leaf store; `createdAt` counts up one second per leaf. */
export class InMemoryLeaves implements LeafStore {
  readonly rows: (LeafRow & { userId: string })[] = [];
  writes = 0;

  constructor(private readonly ownership: Readonly<Record<string, readonly string[]>>) {}

  async list(userId: string, specimenId: string): Promise<readonly LeafRow[]> {
    return this.rows
      .filter((z) => z.userId === userId && z.specimenId === specimenId)
      .map(({ userId: owner, ...row }) => {
        void owner;
        return row;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  async create(userId: string, values: LeafValues): Promise<LeafRow | "specimen_unknown"> {
    this.writes += 1;
    if (!this.ownership[userId]?.includes(values.specimenId)) return "specimen_unknown";
    const row: LeafRow = {
      ...values,
      id: `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, "0")}`,
      createdAt: new Date(Date.UTC(2026, 0, 1) + this.rows.length * 1000).toISOString(),
    };
    this.rows.push({ ...row, userId });
    return row;
  }

  async remove(userId: string, specimenId: string, leafId: string): Promise<boolean> {
    const at = this.rows.findIndex(
      (z) => z.userId === userId && z.specimenId === specimenId && z.id === leafId,
    );
    if (at < 0) return false;
    this.rows.splice(at, 1);
    return true;
  }
}
