// In-memory adapter for tests only; the PostgreSQL adapter lives in `db`.
import { TASK_EXPIRY_DAYS, type AiTask, type TaskStore, type TaskTransition } from "./model";

type Stored = AiTask & { userId: string };

export class InMemoryTasks implements TaskStore {
  readonly rows: Stored[] = [];

  async create(userId: string, t: Parameters<TaskStore["create"]>[1], now: Date) {
    const same = this.rows.find(
      (r) =>
        r.userId === userId &&
        r.type === t.type &&
        r.reference === t.reference &&
        (r.status === "open" || r.status === "in_progress"),
    );
    if (same) return { task: this.view(same, now), created: false };
    const row: Stored = {
      ...t,
      userId,
      id: `00000000-0000-4000-8000-${String(this.rows.length + 100).padStart(12, "0")}`,
      status: "open",
      connectionId: null,
      clientName: null,
      draftId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.rows.push(row);
    return { task: row, created: true };
  }

  private view(r: Stored, now: Date): AiTask {
    const old = now.getTime() - Date.parse(r.createdAt) > TASK_EXPIRY_DAYS * 86400000;
    return {
      ...r,
      status: (r.status === "open" || r.status === "in_progress") && old ? "expired" : r.status,
    };
  }

  async list(userId: string, now: Date) {
    return this.rows
      .filter((r) => r.userId === userId)
      .reverse()
      .map((r) => this.view(r, now));
  }

  async find(userId: string, id: string, now: Date) {
    const r = this.rows.find((x) => x.userId === userId && x.id === id);
    return r ? this.view(r, now) : null;
  }

  async transition(userId: string, id: string, c: TaskTransition, now: Date) {
    const i = this.rows.findIndex((x) => x.userId === userId && x.id === id);
    const r = this.rows[i];
    if (!r) return null;
    const v = this.view(r, now);
    if (v.status === "expired" || !(c.from as readonly string[]).includes(v.status)) return null;
    const next: Stored = {
      ...r,
      status: c.to,
      connectionId: c.connectionId ?? r.connectionId,
      draftId: c.draftId ?? r.draftId,
      clientName: "Claude",
      updatedAt: now.toISOString(),
    };
    this.rows[i] = next;
    return next;
  }
}
