import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFileDatabase, dbRoleFindings, migrate, openPool } from "./kernel/index.ts";

// NFR-15, #1809 (owner decision 2026-11-10), US-DEV-07, d-130: migrations run as the plain owner role, the deploy's
// `migrate` service connects as that role (app/config/deploy/docker-compose.yml). Since the squash (issue 2519) the
// baseline is the whole schema, so it must build as the owner: every object belongs to the owner, the start-up role
// check finds nothing, and the row rules that name the owner (`to current_user`) name the owner and nobody else.
let file: Awaited<ReturnType<typeof createFileDatabase>>;
let owner: Pool;
let applied: string[] = [];

beforeAll(async () => {
  file = await createFileDatabase("baseline");
  owner = openPool(file.ownerUrl);
  owner.on("error", () => undefined);
  applied = await migrate(owner);
}, 120_000);
afterAll(async () => {
  await owner.end();
  await file.drop();
});

describe("US-DEV-07 the baseline builds as the plain owner role (NFR-15)", () => {
  it("US-DEV-07 the owner applies the baseline and nothing else", () => {
    expect(applied).toEqual(["0001_baseline.sql"]);
  });

  it("US-DEV-07 every table, sequence and function of the schema belongs to the owner, and the start-up role check is clean", async () => {
    const left = await owner.query<{ relations: string; routines: string }>(
      `select (select count(*) from pg_class c where relnamespace = 'public'::regnamespace
                 and relkind in ('r', 'p', 'S', 'v') and relowner <> (select oid from pg_roles where rolname = current_user)) as relations,
              (select count(*) from pg_proc p where pronamespace = 'public'::regnamespace
                 and proowner <> (select oid from pg_roles where rolname = current_user)) as routines`,
    );
    expect(left.rows[0]).toEqual({ relations: "0", routines: "0" });
    expect(await dbRoleFindings(owner)).toEqual([]);
  });

  it("US-DEV-07 the row rules that name the owner name the owner (P-04): none binds another role", async () => {
    const r = await owner.query<{ n: string }>(
      `select count(*) as n from pg_policy p
        where p.polroles <> '{0}'::oid[]
          and not (p.polroles @> array[(select oid from pg_roles where rolname = current_user)])
          and not (p.polroles @> array[(select oid from pg_roles where rolname = 'pflanzendex_app')])`,
    );
    expect(r.rows[0]).toEqual({ n: "0" });
  });

  it("US-DEV-07 the reference rows of the chain are there: one access setting and one operator cost row", async () => {
    const r = await owner.query<{ access: string; cost: string }>(
      "select (select count(*) from access_setting) as access, (select count(*) from operator_cost) as cost",
    );
    expect(r.rows[0]).toEqual({ access: "1", cost: "1" });
  });
});
