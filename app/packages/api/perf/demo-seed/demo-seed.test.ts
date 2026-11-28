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
import { resetDemoFriends, resetDemoMatchAnswers } from "./access/reset-demo.ts";
import { parseSubjects } from "./access/subjects.ts";
import { seedAll } from "./accounts/seed-all.ts";
import { seedEmptyAccount } from "./accounts/common/empty-account.ts";
import { speciesByLatin } from "./accounts/common/shared.ts";

// US-DEV-01 / #924: the demo seed runs against a scratch database (migrated like the dev database, superuser
// connection like `make start`), twice, and changes nothing the second time. Everything goes through the API routes, so
// the row rules apply; the test proves the three tenants stay apart afterwards and that the hard lock holds.
const DB = `demo_seed_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
const SUBJECTS = parseSubjects(`test=demo-anna-${DB},test2=demo-ben-${DB},test3=demo-clara-${DB}`);
// The empty account test7 (issue 2500): its subject bypasses Keycloak, as the subjects of the three accounts do. Its rows of
// plants, wishes and friendships, counted on the owner connection: zero for an empty account.
const EMPTY_SUBJECT = `demo-empty-${DB}`;
const EMPTY_ROWS_SQL = `select (select count(*) from specimen s join account a on a.id = s.account_id where a.subject = $1)
  + (select count(*) from wish w join account a on a.id = w.account_id where a.subject = $1)
  + (select count(*) from friendship f join account a on a.id = f.account_id where a.subject = $1) n`;
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
    "leaf",
  ])
    out[table] = Number((await pool.query(`select count(*) n from ${table}`)).rows[0].n);
  return out;
};
const accountId = async (sub: string): Promise<string> =>
  (await pool.query("select id from account where subject = $1", [sub])).rows[0].id;
const count = async (sql: string, args: unknown[] = []): Promise<number> =>
  Number((await pool.query(sql, args)).rows[0].n);
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
  // The order of run-demo-seed.ts: the three accounts, then the empty account (issue 2500), then the states profile.
  const run = async () => {
    await seedAll(pool, {
      subjects: SUBJECTS,
      withPhotos: true,
      media: { store, processor: createSharpProcessor() },
    });
    await seedEmptyAccount(pool, { env: { DEMO_SEED_EMPTY_SUBJECT: EMPTY_SUBJECT } });
  };

  it("US-DEV-01 the first run creates the content of each account", async () => {
    await run();
    first = await counts();
    expect(await own(SUBJECTS.test, "specimen")).toBe(4); // 3 plants and the cutting Clara handed over (#943)
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
    expect(first["offer"]).toBe(4);
    expect(first["swap"]).toBe(6); // one row per side: open (Clara-Ben), handed over and declined (Clara-Anna)
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

  it("US-WAC-07 the seed gives Ben's Birkenfeige leaves: more than one page, sizes and a note", async () => {
    const api = new Caller(pool, new Map());
    const ben = { api, sub: SUBJECTS.test2, name: "Ben", log: () => undefined };
    const species = (await speciesByLatin(ben, ["Ficus benjamina"])).get("Ficus benjamina");
    const specimens = (await api.ok(SUBJECTS.test2, "GET", "/specimens"))["specimens"] as {
      id: string;
      speciesId: string;
      marker: string | null;
    }[];
    const plant = specimens.find((s) => s.speciesId === species && s.marker === null);
    expect(plant).toBeDefined();
    const view = await api.ok(SUBJECTS.test2, "GET", `/specimens/${plant?.id}/leaves`);
    expect(view["keeperOff"]).toBe(false);
    // The leaf log pages by PAGE_SIZE (plant-leaves.tsx, one leaf now): four leaves give a pager at two per page or fewer.
    expect(view["count"]).toBe(4);
    const leaves = view["leaves"] as {
      lengthMm: number | null;
      widthMm: number | null;
      note: string | null;
    }[];
    expect(leaves.every((l) => l.lengthMm !== null && l.widthMm !== null)).toBe(true);
    expect(leaves.some((l) => l.note)).toBe(true);
    expect(view["comparison"]).toMatchObject({ measure: "length", direction: "larger" });
    expect(first["leaf"]).toBe(4);
  });

  it("US-DEV-01 the swap history shows a handed-over and a declined swap (#943, US-SOZ-13)", async () => {
    const api = new Caller(pool, new Map());
    const history = (await api.ok(SUBJECTS.test, "GET", "/swaps/history"))["entries"] as {
      status: string;
      friend: string | null;
      direction: string;
      reason: string | null;
    }[];
    expect(history.map((e) => e.status).sort()).toEqual(["declined", "handed_over"]);
    expect(history.every((e) => e.friend === "Clara" && e.direction === "received")).toBe(true);
    expect(history.find((e) => e.status === "declined")?.reason).toBeTruthy();
    const clara = (await api.ok(SUBJECTS.test3, "GET", "/swaps/history"))["entries"] as {
      status: string;
    }[];
    expect(clara.map((e) => e.status).sort()).toEqual(["declined", "handed_over"]);
    // Clara's request for Ben's cutting stays open.
    const ben = await api.ok(SUBJECTS.test2, "GET", "/swaps?timeZone=Europe/Berlin");
    expect((ben["received"] as { status: string }[]).map((s) => s.status)).toEqual(["requested"]);
  });

  it("US-DEV-01 a second run changes nothing (idempotent)", async () => {
    await run();
    expect(await counts()).toEqual(first);
  }, 180_000);

  it("US-DEV-01 a run after a check that accepted Ben's request makes it open again; the other confirmed friends and the foreign rows stay", async () => {
    const api = new Caller(pool, new Map());
    type Request = { id: string; otherName: string; status: string };
    const requests = async (sub: string) =>
      (await api.ok(sub, "GET", "/friends/requests")) as Record<string, Request[] | undefined>;
    const named = (list: Request[] | undefined, name: string) =>
      (list ?? []).find((r) => r.otherName === name);
    // The friendship rows of account `sub` with the account `other` (the subjects), with their ids and `since`.
    const pairRows = async (sub: string, other: string) =>
      (
        await pool.query(
          "select f.id, f.status, f.since from friendship f join account a on a.id = f.account_id join account o on o.id = f.other_id where a.subject = $1 and o.subject = $2 order by f.id",
          [sub, other],
        )
      ).rows;
    // A device check answers Ben's request: Anna accepts it. The pair is confirmed then, and `befriend` skips a confirmed pair.
    const asked = named((await requests(SUBJECTS.test))["incoming"], "Ben");
    expect(asked?.status).toBe("requested");
    await api.ok(SUBJECTS.test, "POST", `/friends/requests/${asked?.id}/answer`, {
      decision: "accept",
    });
    expect((await pairRows(SUBJECTS.test, SUBJECTS.test2)).map((r) => r["status"])).toEqual([
      "confirmed",
    ]);
    // A foreign account, not one of the three demo accounts: a confirmed friendship with Anna and a friend code.
    const FOREIGN = `foreign-${DB}`;
    const foreignId = randomUUID();
    await pool.query("insert into account (id, subject) values ($1, $2)", [foreignId, FOREIGN]);
    await pool.query(
      `insert into friendship (account_id, other_id, other_name, direction, status, since)
       select a.id, f.id, 'Fremd', 'sent', 'confirmed', now() from account a, account f where a.subject = $1 and f.subject = $2
       union all
       select f.id, a.id, 'Anna', 'received', 'confirmed', now() from account a, account f where a.subject = $1 and f.subject = $2`,
      [SUBJECTS.test, FOREIGN],
    );
    await pool.query(
      "insert into friend_code (code_hash, created_by, expires_at) values (sha256(convert_to('foreign-code', 'UTF8')), $1, now() + interval '7 days')",
      [foreignId],
    );
    const annaClara = await pairRows(SUBJECTS.test, SUBJECTS.test3);
    const foreignFriendship = await pairRows(SUBJECTS.test, FOREIGN);
    const foreignCodes = await count(
      "select count(*) n from friend_code where created_by = (select id from account where subject = $1)",
      [FOREIGN],
    );

    await resetDemoFriends(pool, SUBJECTS);
    await run();

    // Ben's request is open again: Ben sent it and Anna has not answered it (one row per side).
    expect(named((await requests(SUBJECTS.test))["incoming"], "Ben")?.status).toBe("requested");
    expect(named((await requests(SUBJECTS.test2))["outgoing"], "Anna")?.status).toBe("requested");
    expect((await pairRows(SUBJECTS.test, SUBJECTS.test2)).map((r) => r["status"])).toEqual([
      "requested",
    ]);
    expect((await pairRows(SUBJECTS.test2, SUBJECTS.test)).map((r) => r["status"])).toEqual([
      "requested",
    ]);
    // Anna and Clara stay confirmed, with the same rows and the same start (the feed counts from it, US-SOZ-06).
    expect(await pairRows(SUBJECTS.test, SUBJECTS.test3)).toEqual(annaClara);
    // The foreign account's rows are not touched.
    expect(await pairRows(SUBJECTS.test, FOREIGN)).toEqual(foreignFriendship);
    expect(
      await count(
        "select count(*) n from friend_code where created_by = (select id from account where subject = $1)",
        [FOREIGN],
      ),
    ).toBe(foreignCodes);
  }, 300_000);

  it("US-DEV-01 a run after a check that declined and postponed match cards removes those answers of the demo accounts only (issue 2649)", async () => {
    const FOREIGN = `foreign-answers-${DB}`;
    const foreignId = randomUUID();
    await pool.query("insert into account (id, subject) values ($1, $2)", [foreignId, FOREIGN]);
    const offer = (await pool.query("select id from offer limit 1")).rows[0]?.["id"];
    const other =
      (await pool.query("select id from offer offset 1 limit 1")).rows[0]?.["id"] ?? offer;
    const insert = (subject: string, offerId: string, answer: string) =>
      pool.query(
        "insert into swap_match_answer (account_id, offer_id, answer, answered_on) select id, $2, $3, current_date from account where subject = $1 on conflict do nothing",
        [subject, offerId, answer],
      );
    await insert(SUBJECTS.test3, offer, "no");
    await insert(SUBJECTS.test3, other, "later");
    await insert(FOREIGN, offer, "no");
    const mine =
      "select count(*) n from swap_match_answer where account_id in (select id from account where subject = $1)";
    expect(await count(mine, [SUBJECTS.test3])).toBeGreaterThan(0);

    await resetDemoMatchAnswers(pool, SUBJECTS);
    expect(await count(mine, [SUBJECTS.test3])).toBe(0);
    expect(await count(mine, [FOREIGN])).toBe(1);
    await resetDemoMatchAnswers(pool, SUBJECTS); // idempotent
    expect(await count(mine, [SUBJECTS.test3])).toBe(0);
  }, 300_000);

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
    expect(annaList).toHaveLength(4);
    const foreign = await api.call(SUBJECTS.test, "GET", `/specimens/${benList[0]?.id}`);
    expect(foreign.status).toBe(404);
    expect((await api.ok(SUBJECTS.test, "GET", "/wishes/candidates"))["candidates"]).toEqual([]);
  });

  it("US-DEV-01 the empty account test7 has no plant, wish or friend after the seed, and a second run changes none (issue 2500)", async () => {
    // Counted on the owner connection: row security does not apply to it, so every row of the account is seen.
    const emptyRows = async () =>
      Object.fromEntries(
        Object.entries(
          (
            await pool.query(
              `select (select count(*) from specimen s join account a on a.id = s.account_id where a.subject = $1) as specimen,
                      (select count(*) from wish w join account a on a.id = w.account_id where a.subject = $1) as wish,
                      (select count(*) from friendship f join account a on a.id = f.account_id where a.subject = $1) as friendship`,
              [EMPTY_SUBJECT],
            )
          ).rows[0] ?? {},
        ).map(([name, value]) => [name, Number(value)]),
      );
    expect(await count("select count(*) n from account where subject = $1", [EMPTY_SUBJECT])).toBe(
      1,
    );
    expect(await emptyRows()).toEqual({ specimen: 0, wish: 0, friendship: 0 });
    await seedEmptyAccount(pool, { env: { DEMO_SEED_EMPTY_SUBJECT: EMPTY_SUBJECT } });
    expect(await emptyRows()).toEqual({ specimen: 0, wish: 0, friendship: 0 });
    expect(await count("select count(*) n from account where subject = $1", [EMPTY_SUBJECT])).toBe(
      1,
    );
  }, 180_000);

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

  it("US-QS-15 the command refuses an unknown DEMO_TAXON_FIXTURE before it touches the tree (issue 2488)", () => {
    let stderr = "";
    try {
      execFileSync(process.execPath, ["--import", "tsx", RUNNER], {
        env: {
          ...process.env,
          PFLANZENDEX_ENV: "local",
          DATABASE_URL: scratchUrl(),
          DEMO_TAXON_FIXTURE: "resset",
        },
        stdio: "pipe",
        encoding: "utf8",
      });
    } catch (error) {
      stderr = (error as { stderr: string }).stderr;
    }
    expect(stderr).toContain("unknown DEMO_TAXON_FIXTURE 'resset'");
  }, 60_000);

  // Last, because the command writes the same scratch database: it proves that run-demo-seed.ts calls the empty account in the
  // base profile (issue 2500), and that a second command run keeps test7 empty. The object store is not configured here (S3_*
  // are left out), so the command seeds no photos and warns about it.
  it("US-DEV-01 the command seeds the empty account test7 in the base profile, and a second command run keeps it empty (issue 2500)", async () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith("S3_")),
    );
    const runCommand = () =>
      execFileSync(process.execPath, ["--import", "tsx", RUNNER], {
        env: {
          ...env,
          PFLANZENDEX_ENV: "local",
          DATABASE_URL: scratchUrl(),
          DEMO_SEED_PROFILE: "base",
          DEMO_SEED_SUBJECTS: `test=${SUBJECTS.test},test2=${SUBJECTS.test2},test3=${SUBJECTS.test3}`,
          DEMO_SEED_EMPTY_SUBJECT: EMPTY_SUBJECT,
        },
        stdio: "pipe",
        encoding: "utf8",
      });
    const output = runCommand();
    expect(output).toContain("Empty account test7");
    expect(output).toContain("Demo seed done (base)");
    expect(await count("select count(*) n from account where subject = $1", [EMPTY_SUBJECT])).toBe(
      1,
    );
    expect(await count(EMPTY_ROWS_SQL, [EMPTY_SUBJECT])).toBe(0);
    runCommand();
    expect(await count(EMPTY_ROWS_SQL, [EMPTY_SUBJECT])).toBe(0);
  }, 600_000);
});
