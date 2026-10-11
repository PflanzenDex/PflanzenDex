import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

// US-DEV-09: the health endpoint checks database and job queue; it answers without sign-in and names no secrets.
const fakePool = (answer: (sql: string) => unknown) =>
  ({
    query: async (sql: string) => {
      const r = answer(sql);
      if (r instanceof Error) throw r;
      return r;
    },
  }) as unknown as Pool;
const statusRows = (rows: { status: string; n: number }[]) => ({ rows });
const health = async (pool?: Pool) => {
  const res = await createApp(pool ? { pool } : {}).request("/health");
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("US-DEV-09 health endpoint with checks", () => {
  it("US-DEV-09 database and queue fine: 200 ok with the counts of the queue", async () => {
    const pool = fakePool((sql) =>
      sql.includes("from job")
        ? statusRows([
            { status: "queued", n: 2 },
            { status: "running", n: 1 },
          ])
        : { rows: [{ ok: 1 }] },
    );
    expect(await health(pool)).toMatchObject({
      status: 200,
      body: {
        status: "ok",
        checks: {
          database: "ok",
          jobs: { status: "ok", queued: 2, running: 1, dead: 0 },
          storage: "not_configured",
        },
      },
    });
  });

  it("US-DEV-09 dead jobs make the state degraded, the API keeps answering 200", async () => {
    const pool = fakePool((sql) =>
      sql.includes("from job") ? statusRows([{ status: "dead", n: 3 }]) : { rows: [{ ok: 1 }] },
    );
    expect(await health(pool)).toMatchObject({
      status: 200,
      body: { status: "degraded", checks: { jobs: { status: "dead_jobs", dead: 3 } } },
    });
  });

  it("US-DEV-09 a database that does not answer: 503 error, and the error text is not passed on", async () => {
    const pool = fakePool(() => new Error("password authentication failed for user geheim"));
    const r = await health(pool);
    expect(r).toMatchObject({
      status: 503,
      body: { status: "error", checks: { database: "error", jobs: { status: "error" } } },
    });
    expect(JSON.stringify(r.body)).not.toContain("geheim");
  });

  it("US-DEV-09 without a database (tests, local web work) the checks say not_configured, status ok (P-08)", async () => {
    expect(await health()).toMatchObject({
      status: 200,
      body: {
        status: "ok",
        checks: { database: "not_configured", jobs: { status: "not_configured" } },
      },
    });
  });
});
