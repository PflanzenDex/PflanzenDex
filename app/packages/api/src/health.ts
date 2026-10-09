import { productTitle } from "@pflanzendex/core";
import { JobsPostgres } from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";

/** How long the database may take to answer the health check before it counts as down (starting value, assumption). */
const DATABASE_TIMEOUT_MS = 2000;

type Database = "ok" | "error" | "not_configured";
type Jobs =
  | { status: "ok" | "dead_jobs"; queued: number; running: number; dead: number }
  | { status: "error" | "not_configured" };

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

/**
 * `GET /health` (TE-01, TE-03, US-DEV-09): version, commit and the checks of database and job queue, without sign-in
 * and without secrets. The database down answers 503, so the container check and the deploy see it; a dead job or an
 * unreadable queue is `degraded` with 200, because the API still serves. Photo storage is only reported as configured
 * or not: a live call to the object store on every health check would cost money and time (assumption).
 */
export function bindHealth(
  app: Hono,
  opt: { pool?: Pool | undefined; version: string; commit: string; storage: boolean },
) {
  app.get("/health", async (c) => {
    const [db, queue] = await Promise.all([database(opt.pool), jobs(opt.pool)]);
    const status =
      db === "error"
        ? "error"
        : queue.status === "ok" || queue.status === "not_configured"
          ? "ok"
          : "degraded";
    const body = {
      status,
      product: productTitle(),
      version: opt.version,
      commit: opt.commit,
      checks: {
        database: db,
        jobs: queue,
        storage: opt.storage ? "configured" : "not_configured",
      },
    };
    return c.json(body, status === "error" ? 503 : 200);
  });
}
