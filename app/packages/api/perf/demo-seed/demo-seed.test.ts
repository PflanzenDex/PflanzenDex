import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryObjectStore } from "@pflanzendex/core";
import { migrate, openAdminPool, openPool, testDatabaseUrl, withAccount } from "@pflanzendex/db";
import { createSharpProcessor } from "../../src/media/index.ts";
import { seedCatalog } from "../catalog-seed/seed-catalog.ts";
import { SEED_SPECIES } from "../catalog-seed/species-list.ts";
import { Caller } from "./access/caller.ts";
import { parseSubjects } from "./access/subjects.ts";
import { seedAll } from "./accounts/seed-all.ts";

// US-DEV-01 / #924: the demo seed runs against a scratch database (migrated like the dev database, superuser
// connection like `make start`), twice, and changes nothing the second time. Everything goes through the API routes, so
// the row rules apply; the test proves the three tenants stay apart afterwards and that the hard lock holds.
const DB = `demo_seed_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
const SUBJECTS = parseSubjects(`test=demo-anna-${DB},test2=demo-ben-${DB},test3=demo-clara-${DB}`);
const RUNNER = fileURLToPath(new URL("./run-demo-seed.ts", import.meta.url));
let admin: Pool;
let pool: Pool;
const store = new InMemoryObjectStore();

const scratchUrl = () => {
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${DB}`;
  return url.toString();
};
const counts = async (): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  for (const table of [
    "specimen",
    "measurement",
    "treatment",
    "wish",
    "equipment",
    "offer",
    "friendship",
    "swap",
    "catalog_correction",
    "achievement_rhythm_pause",
    "light_zone",
    "location",
  ])
    out[table] = Number((await pool.query(`select count(*) n from ${table}`)).rows[0].n);
  return out;
};
const accountId = async (sub: string): Promise<string> =>
  (await pool.query("select id from account where subject = $1", [sub])).rows[0].id;
const own = (sub: string, table: string) =>
  accountId(sub).then((id) =>
    withAccount(pool, id, async (c) =>
      Number((await c.query(`select count(*) n from ${table}`)).rows[0].n),
    ),
  );

beforeAll(async () => {
  admin = openAdminPool();
  await admin.query(`create database ${DB}`);
  pool = openPool(scratchUrl());
  pool.on("error", () => undefined);
  await migrate(pool);
  await seedCatalog(pool, SEED_SPECIES);
}, 120_000);
afterAll(async () => {
  await pool.end();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.end();
});

describe("US-DEV-01 demo seed fills test, test2 and test3 (#924)", () => {
  let first: Record<string, number>;
  const run = () =>
    seedAll(pool, {
      subjects: SUBJECTS,
      withPhotos: true,
      media: { store, processor: createSharpProcessor() },
    });

  it("US-DEV-01 the first run creates the content of each account", async () => {
    await run();
    first = await counts();
    expect(await own(SUBJECTS.test, "specimen")).toBe(3);
    expect(await own(SUBJECTS.test2, "specimen")).toBe(50);
    // #939: Ben's cuttings carry measurements too (E-11), so the reminder and the care rhythm show them.
    const benCuttingsMeasured = await accountId(SUBJECTS.test2).then((id) =>
      withAccount(pool, id, async (c) =>
        Number(
          (
            await c.query(
              "select count(distinct s.id) n from specimen s join measurement m on m.specimen_id = s.id where s.status = 'cutting'",
            )
          ).rows[0].n,
        ),
      ),
    );
    expect(benCuttingsMeasured).toBe(7);
    expect(await own(SUBJECTS.test3, "specimen")).toBeGreaterThanOrEqual(5);
    expect(first["measurement"]).toBeGreaterThan(150);
    expect(first["offer"]).toBe(3);
    expect(first["swap"]).toBeGreaterThanOrEqual(1);
    expect(first["catalog_correction"]).toBe(1);
    expect(first["treatment"]).toBeGreaterThan(0);
    expect(
      (await pool.query("select count(*) n from measurement where photo is not null")).rows[0].n,
    ).toBe("8");
    expect(
      (await pool.query("select count(*) n from wish where visible_to_friends")).rows[0].n,
    ).toBe("3");
    const style = await pool.query(
      "select style, count(*) n from account_style group by style order by style",
    );
    expect(style.rows.map((r) => r.style)).toEqual(["few", "many"]);
  }, 180_000);

  it("US-DEV-01 a second run changes nothing (idempotent)", async () => {
    await run();
    expect(await counts()).toEqual(first);
  }, 180_000);

  it("US-DEV-01 the tenants stay apart after the seed (P-04)", async () => {
    // Each account sees only its own rows through row security, and a foreign specimen looks like an unknown one.
    expect(await own(SUBJECTS.test, "measurement")).toBeLessThan(first["measurement"] ?? 0);
    const sum =
      (await own(SUBJECTS.test, "specimen")) +
      (await own(SUBJECTS.test2, "specimen")) +
      (await own(SUBJECTS.test3, "specimen"));
    expect(sum).toBe(first["specimen"]);
    const api = new Caller(pool, new Map());
    const annaList = (await api.ok(SUBJECTS.test, "GET", "/specimens"))["specimens"] as {
      id: string;
    }[];
    const benList = (await api.ok(SUBJECTS.test2, "GET", "/specimens"))["specimens"] as {
      id: string;
    }[];
    expect(annaList).toHaveLength(3);
    const foreign = await api.call(SUBJECTS.test, "GET", `/specimens/${benList[0]?.id}`);
    expect(foreign.status).toBe(404);
    expect((await api.ok(SUBJECTS.test, "GET", "/wishes/candidates"))["candidates"]).toEqual([]);
  });

  it("US-DEV-01 the command refuses prod and an unknown environment and writes nothing", () => {
    const attempt = (env: string | undefined) => {
      const vars: NodeJS.ProcessEnv = {
        ...process.env,
        DATABASE_URL: scratchUrl(),
        DEMO_SEED_SUBJECTS: "test=a,test2=b,test3=c",
      };
      if (env === undefined) delete vars["PFLANZENDEX_ENV"];
      else vars["PFLANZENDEX_ENV"] = env;
      try {
        execFileSync(process.execPath, ["--import", "tsx", RUNNER], {
          env: vars,
          stdio: "pipe",
          encoding: "utf8",
        });
        return { code: 0, message: "" };
      } catch (error) {
        const e = error as { status: number; stderr: string };
        return { code: e.status, message: e.stderr };
      }
    };
    expect(attempt("prod")).toMatchObject({
      code: 1,
      message: expect.stringContaining("never runs in production"),
    });
    expect(attempt("staging")).toMatchObject({
      code: 1,
      message: expect.stringContaining("unknown PFLANZENDEX_ENV"),
    });
    expect(attempt(undefined)).toMatchObject({
      code: 1,
      message: expect.stringContaining("not set"),
    });
  }, 60_000);
});
