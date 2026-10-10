// In-memory adapter for tests only; the PostgreSQL adapter lives in `db`.
import { rankOf } from "./rights";
import type { AiConnection, ConnectionStore } from "./connection";
import type { AiLogRow, AiLogStore } from "./status";

type Stored = AiConnection & { userId: string };

export class InMemoryConnections implements ConnectionStore {
  readonly rows: Stored[] = [];
  private next = 1;

  async latest(userId: string, clientId: string) {
    const mine = this.rows.filter((r) => r.userId === userId && r.clientId === clientId);
    return mine[mine.length - 1] ?? null;
  }

  async create(
    userId: string,
    input: Pick<AiConnection, "clientId" | "clientName" | "rights">,
    now: Date,
  ) {
    const row = {
      ...input,
      userId,
      id: `00000000-0000-4000-8000-${String(this.next++).padStart(12, "0")}`,
      requestedRights: null,
      createdAt: now.toISOString(),
      lastUse: null,
      revokedAt: null,
    };
    this.rows.push(row);
    return row;
  }

  async touch(userId: string, id: string, now: Date, requested: AiConnection["rights"] | null) {
    this.change(userId, id, (row) => ({
      ...row,
      lastUse: now.toISOString(),
      requestedRights: requested,
    }));
  }

  private change(userId: string, id: string, fn: (row: Stored) => Stored): Stored | null {
    const i = this.rows.findIndex((r) => r.userId === userId && r.id === id);
    const row = this.rows[i];
    if (!row) return null;
    const next = fn(row);
    this.rows[i] = next;
    return next;
  }

  async list(userId: string) {
    return this.rows.filter((r) => r.userId === userId).reverse();
  }

  async setRights(userId: string, id: string, rights: AiConnection["rights"]) {
    const row = this.rows.find((r) => r.userId === userId && r.id === id);
    if (!row || row.revokedAt) return null;
    const keep = row.requestedRights && rankOf(row.requestedRights) > rankOf(rights);
    return this.change(userId, id, (r) => ({
      ...r,
      rights,
      requestedRights: keep ? r.requestedRights : null,
    }));
  }

  async revoke(userId: string, id: string, now: Date) {
    const row = this.rows.find((r) => r.userId === userId && r.id === id);
    if (!row) return "unknown" as const;
    if (row.revokedAt) return "already" as const;
    this.change(userId, id, (r) => ({ ...r, revokedAt: now.toISOString() }));
    return "revoked" as const;
  }
}

export class InMemoryAiLog implements AiLogStore {
  readonly rows: (AiLogRow & { userId: string })[] = [];

  async record(
    userId: string,
    entry: { connectionId: string; operation: string; effect: string },
    now: Date,
  ) {
    this.rows.push({
      ...entry,
      userId,
      id: `l${this.rows.length + 1}`,
      clientName: "Claude",
      createdAt: now.toISOString(),
      undoneAt: null,
    });
  }

  async list(userId: string, limit: number) {
    return this.rows
      .filter((r) => r.userId === userId)
      .reverse()
      .slice(0, limit);
  }
}
