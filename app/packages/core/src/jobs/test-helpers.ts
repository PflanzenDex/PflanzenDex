import {
  JOB_STATUS,
  type JobFailure,
  type JobQueue,
  type JobRow,
  type JobStatus,
  type NewJob,
} from "./types";

type Entry = {
  row: JobRow;
  lockedBy: string | null;
  leaseUntil: Date | null;
  finishedAt: Date | null;
};
const OPEN: readonly JobStatus[] = ["queued", "running"];

/** In-memory adapter for tests only; the PostgreSQL adapter lives in `db`. */
export class InMemoryJobQueue implements JobQueue {
  private readonly entries: Entry[] = [];

  async enqueue(job: NewJob): Promise<{ job: JobRow; created: boolean }> {
    const same = this.entries.find(
      (e) =>
        job.dedupeKey !== null &&
        e.row.type === job.type &&
        e.row.dedupeKey === job.dedupeKey &&
        OPEN.includes(e.row.status),
    );
    if (same) return { job: same.row, created: false };
    const row: JobRow = {
      ...job,
      id: `j${this.entries.length + 1}`,
      status: "queued",
      attempts: 0,
      lastError: null,
    };
    this.entries.push({ row, lockedBy: null, leaseUntil: null, finishedAt: null });
    return { job: row, created: true };
  }

  async claim(workerId: string, now: Date, leaseMs: number): Promise<JobRow | null> {
    this.sweep(now);
    const due = this.entries
      .filter((e) => e.row.status === "queued" && e.row.runAt <= now)
      .sort((a, b) => a.row.runAt.getTime() - b.row.runAt.getTime())[0];
    if (!due) return null;
    this.set(due, { status: "running", attempts: due.row.attempts + 1 });
    due.lockedBy = workerId;
    due.leaseUntil = new Date(now.getTime() + leaseMs);
    return due.row;
  }

  async succeed(id: string, workerId: string, now: Date): Promise<boolean> {
    const e = this.owned(id, workerId);
    if (!e) return false;
    this.finish(e, "succeeded", now);
    return true;
  }

  async fail(id: string, workerId: string, now: Date, failure: JobFailure) {
    const { error, retryAt } = failure;
    const e = this.owned(id, workerId);
    if (!e) return false;
    if (retryAt === null) this.finish(e, "dead", now, error);
    else {
      this.set(e, { status: "queued", runAt: retryAt, lastError: error });
      e.lockedBy = null;
      e.leaseUntil = null;
    }
    return true;
  }

  async counts(): Promise<Record<JobStatus, number>> {
    const counts = Object.fromEntries(JOB_STATUS.map((s) => [s, 0])) as Record<JobStatus, number>;
    for (const e of this.entries) counts[e.row.status] += 1;
    return counts;
  }

  async purge(before: Date): Promise<number> {
    const keep = this.entries.filter((e) => !e.finishedAt || e.finishedAt >= before);
    const removed = this.entries.length - keep.length;
    this.entries.splice(0, this.entries.length, ...keep);
    return removed;
  }

  /** Test access: the current state of a job. */
  get(id: string): JobRow | undefined {
    return this.entries.find((e) => e.row.id === id)?.row;
  }

  private sweep(now: Date): void {
    for (const e of this.entries) {
      const lost = e.row.status === "running" && e.leaseUntil !== null && e.leaseUntil <= now;
      if (lost && e.row.attempts >= e.row.maxAttempts)
        this.finish(e, "dead", now, "worker lost, no attempts left");
      else if (lost) this.set(e, { status: "queued" });
      if (e.row.status === "queued" && e.row.expiresAt !== null && e.row.expiresAt <= now)
        this.finish(e, "expired", now);
    }
  }

  private owned(id: string, workerId: string): Entry | undefined {
    const e = this.entries.find((x) => x.row.id === id);
    return e && e.row.status === "running" && e.lockedBy === workerId ? e : undefined;
  }

  private finish(e: Entry, status: JobStatus, now: Date, error?: string): void {
    this.set(e, { status, ...(error === undefined ? {} : { lastError: error }) });
    e.lockedBy = null;
    e.leaseUntil = null;
    e.finishedAt = now;
  }

  private set(e: Entry, change: Partial<JobRow>): void {
    e.row = { ...e.row, ...change };
  }
}
