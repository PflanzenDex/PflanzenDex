import type { Pool } from "pg";

// Same shapes as `JobQueue` in `core` (structurally equal; `db` does not import `core`).
export type JobStatus = "queued" | "running" | "succeeded" | "dead" | "expired";
export interface JobRow {
  readonly id: string;
  readonly type: string;
  readonly dedupeKey: string | null;
  readonly payload: { readonly [key: string]: unknown };
  readonly status: JobStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly runAt: Date;
  readonly expiresAt: Date | null;
  readonly lastError: string | null;
}
export interface JobFailure {
  readonly error: string;
  readonly retryAt: Date | null;
}
export interface NewJob {
  readonly type: string;
  readonly dedupeKey: string | null;
  readonly payload: { readonly [key: string]: unknown };
  readonly runAt: Date;
  readonly expiresAt: Date | null;
  readonly maxAttempts: number;
}

type Row = {
  id: string;
  type: string;
  dedupe_key: string | null;
  payload: { [key: string]: unknown };
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: Date;
  expires_at: Date | null;
  last_error: string | null;
};

const COLUMNS =
  "id, type, dedupe_key, payload, status, attempts, max_attempts, run_at, expires_at, last_error";

const toJob = (r: Row): JobRow => ({
  id: r.id,
  type: r.type,
  dedupeKey: r.dedupe_key,
  payload: r.payload,
  status: r.status,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  runAt: r.run_at,
  expiresAt: r.expires_at,
  lastError: r.last_error,
});

/**
 * Job queue in PostgreSQL (TE-06). Needs the owner connection: the application role has no rights on `job`.
 * `claim` uses `for update skip locked`, so concurrent workers never get the same job; a unique index over the open
 * (type, dedupe key) makes `enqueue` merge atomically. All times come from the caller (no clock in SQL).
 */
export class JobsPostgres {
  constructor(private readonly pool: Pool) {}

  async enqueue(job: NewJob): Promise<{ job: JobRow; created: boolean }> {
    const inserted = await this.pool.query<Row>(
      `insert into job (type, dedupe_key, payload, run_at, expires_at, max_attempts)
       values ($1, $2, $3, $4, $5, $6) on conflict do nothing returning ${COLUMNS}`,
      [
        job.type,
        job.dedupeKey,
        JSON.stringify(job.payload),
        job.runAt,
        job.expiresAt,
        job.maxAttempts,
      ],
    );
    if (inserted.rows[0]) return { job: toJob(inserted.rows[0]), created: true };
    const open = await this.pool.query<Row>(
      `select ${COLUMNS} from job where type = $1 and dedupe_key = $2 and status in ('queued', 'running')`,
      [job.type, job.dedupeKey],
    );
    // The open job finished between the two statements: order again, now nothing is open any more.
    if (!open.rows[0]) return this.enqueue(job);
    return { job: toJob(open.rows[0]), created: false };
  }

  async claim(workerId: string, now: Date, leaseMs: number): Promise<JobRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update job set status = 'dead', locked_by = null, lease_until = null, finished_at = $1,
                last_error = 'worker lost, no attempts left'
          where status = 'running' and lease_until <= $1 and attempts >= max_attempts`,
        [now],
      );
      await client.query(
        `update job set status = 'queued', locked_by = null, lease_until = null
          where status = 'running' and lease_until <= $1`,
        [now],
      );
      await client.query(
        `update job set status = 'expired', finished_at = $1
          where status = 'queued' and expires_at is not null and expires_at <= $1`,
        [now],
      );
      const r = await client.query<Row>(
        `update job set status = 'running', attempts = attempts + 1, locked_by = $2,
                lease_until = $1::timestamptz + $3 * interval '1 millisecond'
          where id = (select id from job where status = 'queued' and run_at <= $1
                       order by run_at, created_at limit 1 for update skip locked)
          returning ${COLUMNS}`,
        [now, workerId, leaseMs],
      );
      await client.query("commit");
      return r.rows[0] ? toJob(r.rows[0]) : null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async succeed(id: string, workerId: string, now: Date): Promise<boolean> {
    const r = await this.pool.query(
      `update job set status = 'succeeded', locked_by = null, lease_until = null, finished_at = $3
        where id = $1 and status = 'running' and locked_by = $2`,
      [id, workerId, now],
    );
    return r.rowCount === 1;
  }

  async fail(id: string, workerId: string, now: Date, failure: JobFailure): Promise<boolean> {
    const { error, retryAt } = failure;
    const r = await this.pool.query(
      `update job set status = case when $5::timestamptz is null then 'dead' else 'queued' end,
              run_at = coalesce($5::timestamptz, run_at), last_error = $4, locked_by = null, lease_until = null,
              finished_at = case when $5::timestamptz is null then $3::timestamptz end
        where id = $1 and status = 'running' and locked_by = $2`,
      [id, workerId, now, error, retryAt],
    );
    return r.rowCount === 1;
  }

  async counts(): Promise<Record<JobStatus, number>> {
    const r = await this.pool.query<{ status: JobStatus; n: number }>(
      "select status, count(*)::int as n from job group by status",
    );
    const counts: Record<JobStatus, number> = {
      queued: 0,
      running: 0,
      succeeded: 0,
      dead: 0,
      expired: 0,
    };
    for (const row of r.rows) counts[row.status] = row.n;
    return counts;
  }

  async purge(before: Date): Promise<number> {
    const r = await this.pool.query(
      "delete from job where finished_at is not null and finished_at < $1",
      [before],
    );
    return r.rowCount ?? 0;
  }
}
