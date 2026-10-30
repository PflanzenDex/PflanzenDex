import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findOrCreateAccount,
  migrate,
  openFixturePool,
  openOwnerPool,
  SpeciesPostgres,
} from "@pflanzendex/db";
import { describeTarget, runCatalogLoad } from "./cli.ts";
import { OPERATOR_SUBJECT, START_LICENSE, START_SOURCE, prepareRecords } from "./catalog-loader.ts";
import { START_SPECIES } from "./start-species.ts";
import type { StartSpecies } from "./start-species.ts";

// US-BES-12 / US-ONB-01 (#991): the operator command that loads the curated start catalog into production.
// Real PostgreSQL (`make db-up`). The owner connection of the suite is a plain role without BYPASSRLS, like production.
let owner: Pool;
let admin: Pool;
const letters = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const species = (suffix: string, extra: Partial<StartSpecies> = {}): StartSpecies => ({
  latin: `Loadgenus ${letters}${suffix}`,
  german: `Ladeart ${letters}${suffix}`,
  english: `Load plant ${letters}${suffix}`,
  familyLatin: "Araceae",
  familyGerman: "Aronstabgewächse",
  difficulty: 2,
  standardLevel: 3,
  synonyms: [`Synogenus ${letters}${suffix}`],
  ...extra,
});
const LIST = [species("alpha"), species("beta", { german: null, familyGerman: null })];
const DATABASE = "pflanzendex_test_owner";

async function counts() {
  const r = await admin.query<{ n: number; p: number; r: number }>(
    `select (select count(*)::int from species where latin_name like $1) as n,
            (select count(*)::int from catalog_field_provenance f join species s on s.id = f.species_id
              where s.latin_name like $1) as p,
            (select count(*)::int from review_case c join species s on s.id = c.object_id
              where s.latin_name like $1 and c.status = 'curated') as r`,
    [`Loadgenus ${letters}%`],
  );
  return r.rows[0];
}

async function run(
  argv: string[],
  list: readonly StartSpecies[] = LIST,
  pool: () => Pool = () => owner,
) {
  const out: string[] = [];
  const code = await runCatalogLoad({
    argv,
    env: { DATABASE_URL: `postgres://secretuser:secretpass@db.example:5432/${DATABASE}` },
    // The suite owns its pools: hand out the pool without letting the command close it.
    openPool: () => {
      const p = pool();
      return {
        query: p.query.bind(p),
        connect: p.connect.bind(p),
        end: async () => undefined,
      } as unknown as Pool;
    },
    out: (l) => out.push(l),
    now: () => new Date("2026-10-30T10:00:00Z"),
    list,
  });
  return { code, out: out.join("\n") };
}

beforeAll(async () => {
  owner = openOwnerPool();
  admin = openFixturePool();
  await migrate(owner);
});
afterAll(async () => {
  const c = await admin.connect();
  try {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    const like = `Loadgenus ${letters}%`;
    await c.query(
      "delete from review_case where object_id in (select id from species where latin_name like $1)",
      [like],
    );
    await c.query("delete from species where latin_name like $1", [like]);
    await c.query("commit");
  } finally {
    c.release();
  }
  await admin.end();
  await owner.end();
});

describe("US-BES-12 catalog:load, the curated start catalog (#991)", () => {
  it("US-BES-12: Given the curated list, then every row is a valid species name, listed once, with the family known", () => {
    const records = prepareRecords(START_SPECIES);
    expect(records.length).toBeGreaterThanOrEqual(100);
    for (const r of records) {
      expect(r.familyLatin).not.toBe("");
      expect(r.source).toBe(START_SOURCE);
    }
    expect(records.filter((r) => r.germanName === null).length).toBeLessThan(records.length / 4);
  });

  it("US-BES-12: Given a list, when --dry-run runs, then it reports new and present species and writes nothing", async () => {
    const { code, out } = await run(["--dry-run"]);
    expect(code).toBe(0);
    expect(out).toContain("New: 2, already present: 0");
    expect(out).toContain("Dry run: nothing was written.");
    expect(await counts()).toEqual({ n: 0, p: 0, r: 0 });
  });

  it("US-BES-12: Given no confirmation or a wrong one, when the command runs, then it refuses and writes nothing", async () => {
    const none = await run([]);
    expect(none.code).toBe(1);
    expect(none.out).toContain(`Refused: pass --confirm ${DATABASE}`);
    const wrong = await run(["--confirm", "other_db"]);
    expect(wrong.code).toBe(1);
    expect(await counts()).toEqual({ n: 0, p: 0, r: 0 });
  });

  it("US-BES-12: Given the summary, then it names host and database but never the user or the password", async () => {
    const { out } = await run(["--dry-run"]);
    expect(out).toContain(`Target: db.example:5432/${DATABASE}`);
    expect(out).not.toContain("secretpass");
    expect(out).not.toContain("secretuser");
    expect(describeTarget("postgres://u:p@h:5/d")).toEqual({ target: "h:5/d", database: "d" });
  });

  it("US-BES-12: Given a database that was never loaded, when it is confirmed, then curated species with provenance exist and everybody finds them", async () => {
    const { code, out } = await run(["--confirm", DATABASE]);
    expect(code).toBe(0);
    expect(out).toContain("Done: 2 species added, 0 already present.");
    // alpha: family and German name, beta: family only (its German name is unknown, P-08)
    expect(await counts()).toEqual({ n: 2, p: 3, r: 2 });
    const row = await admin.query(
      `select s.created_by, s.source, f.origin, f.license, f.source as fsource, f.link
         from species s join catalog_field_provenance f on f.species_id = s.id
        where s.latin_name = $1 and f.field = 'german_name'`,
      [`Loadgenus ${letters}alpha`],
    );
    expect(row.rows).toEqual([
      {
        created_by: "operator",
        source: START_SOURCE,
        origin: "operator",
        license: START_LICENSE,
        fsource: null,
        link: null,
      },
    ]);
    // Tenant view: an unrelated account finds the approved species by German name and by synonym, like the app does.
    const stranger = await findOrCreateAccount(owner, `loader-stranger-${letters}`);
    const search = new SpeciesPostgres(owner);
    const hits = await search.search(stranger, `ladeart ${letters}alpha`);
    expect(hits.map((h) => h.latinName)).toEqual([`Loadgenus ${letters}alpha`]);
    const bySynonym = await search.search(stranger, `synogenus ${letters}beta`);
    expect(bySynonym.map((h) => h.latinName)).toEqual([`Loadgenus ${letters}beta`]);
    await admin.query("delete from account where id = $1", [stranger]);
  });

  it("US-BES-12: Given a loaded catalog, when the command runs a second time, then nothing is added twice (idempotent)", async () => {
    const again = await run(["--confirm", DATABASE]);
    expect(again.code).toBe(0);
    expect(again.out).toContain("Done: 0 species added, 2 already present.");
    expect(await counts()).toEqual({ n: 2, p: 3, r: 2 });
  });

  it("US-BES-12: Given a failure in the last row, when it is loaded, then no species of the batch remains (one transaction)", async () => {
    const list = [species("gamma"), species("delta", { english: "x".repeat(200) })];
    const { code, out } = await run(["--confirm", DATABASE], list);
    expect(code).toBe(1);
    expect(out).toContain("Failed, no species was written");
    const r = await admin.query("select 1 from species where latin_name = $1", [
      `Loadgenus ${letters}gamma`,
    ]);
    expect(r.rowCount).toBe(0);
  });

  it("US-BES-12: Given a superuser connection, when the command runs, then the role check refuses before anything is written", async () => {
    const { code, out } = await run(["--confirm", DATABASE], [species("eps")], () => admin);
    expect(code).toBe(1);
    expect(out).toContain("Unsafe database roles");
    const r = await admin.query("select 1 from species where latin_name = $1", [
      `Loadgenus ${letters}eps`,
    ]);
    expect(r.rowCount).toBe(0);
  });

  it("US-BES-12: Given no DATABASE_URL, then the command never falls back to a test database", async () => {
    const out: string[] = [];
    const code = await runCatalogLoad({
      argv: ["--dry-run"],
      env: {},
      openPool: () => {
        throw new Error("must not connect");
      },
      out: (l) => out.push(l),
      now: () => new Date(),
    });
    expect(code).toBe(1);
    expect(out.join("\n")).toContain("DATABASE_URL is not set");
  });

  it("US-BES-12: Given the batch ran, then its account holds exactly the operator role", async () => {
    const r = await admin.query(
      "select r.role from account a join account_role r on r.account = a.id where a.subject = $1",
      [OPERATOR_SUBJECT],
    );
    expect(r.rows).toEqual([{ role: "operator" }]);
  });

  it("US-BES-12: Given PFLANZENDEX_ENV=prod, when the dev seed runs, then it refuses", () => {
    let stderr = "";
    try {
      execFileSync("npx", ["tsx", "perf/catalog-seed/run-seed.ts"], {
        env: { ...process.env, PFLANZENDEX_ENV: "prod" },
        stdio: "pipe",
      });
    } catch (error) {
      stderr = String((error as { stderr?: Buffer }).stderr);
    }
    expect(stderr).toContain("Catalog seed refused: PFLANZENDEX_ENV is 'prod'");
  });
});
