import { productTitle } from "@pflanzendex/core";
import { JobsPostgres } from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { deletionDeadlineCheck, type DeletionDeadlineCheck } from "./privacy";

/** How long the database may take to answer the health check before it counts as down (starting value, assumption). */
const DATABASE_TIMEOUT_MS = 2000;

type Database = "ok" | "error" | "not_configured";
type Jobs =
  | { status: "ok" | "dead_jobs"; queued: number; running: number; dead: number }
  | { status: "error" | "not_configured" };
// The deletion deadlines (US-ACC-04, issue 1673): `near` and `deadline_passed` make the state degraded; an unreadable
// state is degraded too, because it is not known to be fine (P-10).
type Deadlines = DeletionDeadlineCheck | { status: "error" | "not_configured" };

const withTimeout = <T>(p: Promise<T>): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), DATABASE_TIMEOUT_MS),
    ),
  ]);

async function database(pool: Pool | undefined): Promise<Database> {
  if (!pool) return "not_configured";
  try {
    await withTimeout(pool.query("select 1 as ok"));
    return "ok";
  } catch {
    // The error text may name the user or the host; the endpoint is public, so only the state leaves (US-DEV-09).
    return "error";
  }
}

async function jobs(pool: Pool | undefined): Promise<Jobs> {
  if (!pool) return { status: "not_configured" };
  try {
    const { queued, running, dead } = await withTimeout(new JobsPostgres(pool).counts());
    return { status: dead > 0 ? "dead_jobs" : "ok", queued, running, dead };
  } catch {
    return { status: "error" };
  }
}

async function deadlines(pool: Pool | undefined): Promise<Deadlines> {
  if (!pool) return { status: "not_configured" };
  try {
    return await withTimeout(deletionDeadlineCheck(pool, new Date()));
  } catch {
    return { status: "error" };
  }
}

const unhealthyDeadlines = (d: Deadlines) =>
  d.status === "near" || d.status === "deadline_passed" || d.status === "error";

/**
 * Health of the API (TE-01, TE-03, US-DEV-09), without sign-in and without secrets. `GET /health` is public and answers
 * only the status keyword: version, commit and queue counts would help an attacker match the deployment to known issues
 * (#759). `GET /health/details` adds version, commit and the checks of database and job queue; the proxy does not
 * serve it on the public name, the deploy's smoke test reads it inside the stack. The database down answers 503, so
 * the container check and the deploy see it; a dead job or an unreadable queue is `degraded` with 200, because the API
 * still serves. Photo storage is only reported as configured or not: a live call to the object store on every health
 * check would cost money and time (assumption).
 */
export function bindHealth(
  app: Hono,
  opt: { pool?: Pool | undefined; version: string; commit: string; storage: boolean },
) {
  const check = async () => {
    const [db, queue, deletions] = await Promise.all([
      database(opt.pool),
      jobs(opt.pool),
      deadlines(opt.pool),
    ]);
    const healthy =
      (queue.status === "ok" || queue.status === "not_configured") &&
      !unhealthyDeadlines(deletions);
    const status = db === "error" ? "error" : healthy ? "ok" : "degraded";
    return { status, db, queue, deletions } as const;
  };
  app.get("/health", async (c) => {
    const { status } = await check();
    return c.json({ status }, status === "error" ? 503 : 200);
  });
  app.get("/health/details", async (c) => {
    const { status, db, queue, deletions } = await check();
    const body = {
      status,
      product: productTitle(),
      version: opt.version,
      commit: opt.commit,
      checks: {
        database: db,
        jobs: queue,
        storage: opt.storage ? "configured" : "not_configured",
        deletionDeadlines: deletions,
      },
    };
    return c.json(body, status === "error" ? 503 : 200);
  });
}
