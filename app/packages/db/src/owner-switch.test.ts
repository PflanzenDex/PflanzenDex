import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assignRole,
  befriend,
  createAccountWithName,
  createFixtureSpecimen,
  createSuperuserOwnerDatabase,
  type SuperuserOwnerDatabase,
} from "./fixtures.ts";
import { SharingPostgres } from "./social/index.ts";
import { dbRoleFindings } from "./kernel/connection/role-check.ts";
import {
  MIGRATIONS_DIRECTORY,
  migrate,
  openPool,
  testDatabaseUrl,
  withAccount,
} from "./kernel/index.ts";

// #907, US-DEV-07, P-04: an existing database that was created and migrated by the cluster superuser is handed to a plain
// owner role (deploy: app/config/deploy/docker/db-roles/). The migrations of the superuser era are applied first (all but the
// last one, 0094), then the ownership moves, then the owner applies the rest and everything still works.
const TRANSFER = readFileSync(
  new URL("../../../config/deploy/docker/db-roles/transfer-ownership.sql", import.meta.url),
  "utf8",
);
const OWNER = `ownsw_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
const PASSWORD = "owner-switch-local-only"; // loopback test container only, never a real credential
let db: SuperuserOwnerDatabase;
let owner: Pool;
let oldMigrations: string;
const [anna, ben, cleo] = [randomUUID(), randomUUID(), randomUUID()];

beforeAll(async () => {
  oldMigrations = mkdtempSync(join(tmpdir(), "pdx-migrations-"));
  for (const f of readdirSync(MIGRATIONS_DIRECTORY).filter(
    (x) => x.endsWith(".sql") && !x.startsWith("0094_"),
  ))
    cpSync(join(MIGRATIONS_DIRECTORY, f), join(oldMigrations, f));
  db = await createSuperuserOwnerDatabase("ownersw", { directory: oldMigrations });
  await db.pool.query(
    `create role ${OWNER} login nosuperuser nocreatedb nocreaterole nobypassrls password '${PASSWORD}'`,
  );
  await db.pool.query(`grant pflanzendex_app to ${OWNER} with admin option`);
  // As init-db-roles.sh does: the database (and with it the public schema) belongs to the owner role.
  await db.pool.query(`alter database ${db.name} owner to ${OWNER}`);
  for (const id of [anna, ben, cleo])
    await createAccountWithName(db.pool, id, `W-${id.slice(0, 4)}`);
  await assignRole(db.pool, anna, "operator");
});
afterAll(async () => {
  await owner?.end();
  await db.drop();
  await db.pool.query(`drop role if exists ${OWNER}`).catch(() => undefined);
  rmSync(oldMigrations, { recursive: true, force: true });
});

describe("US-DEV-07 handing an existing database to a plain owner role (#907)", () => {
  it("US-DEV-07 the transfer moves tables, sequences and functions, a second run finds nothing", async () => {
    await db.pool.query("select set_config('pflanzendex.new_owner', $1, false)", [OWNER]);
    await db.pool.query(TRANSFER);
    await db.pool.query(TRANSFER);
    const left = await db.pool.query(
      `select (select count(*) from pg_class c where relnamespace = 'public'::regnamespace and relkind in ('r', 'p', 'S', 'v')
                 and relowner <> (select oid from pg_roles where rolname = $1)) as relations,
              (select count(*) from pg_proc p where pronamespace = 'public'::regnamespace
                 and proowner <> (select oid from pg_roles where rolname = $1)) as routines`,
      [OWNER],
    );
    expect(left.rows[0]).toEqual({ relations: "0", routines: "0" });
  });

  it("US-DEV-07 the owner applies migration 0094: the owner policies follow, the start-up check is clean", async () => {
    const url = new URL(testDatabaseUrl());
    url.username = OWNER;
    url.password = PASSWORD;
    url.pathname = new URL(db.url).pathname;
    owner = openPool(url.toString());
    owner.on("error", () => undefined);
    expect(await migrate(owner)).toEqual([expect.stringMatching(/^0094_/)]);
    const stale = await owner.query(
      `select count(*) as n from pg_policy where polroles <> '{0}'::oid[]
          and not (polroles @> array[(select oid from pg_roles where rolname = 'pflanzendex_app')])
          and not (polroles @> array[(select oid from pg_roles where rolname = current_user)])`,
    );
    expect(stale.rows[0]).toEqual({ n: "0" });
    expect(await dbRoleFindings(owner)).toEqual([]);
  });

  it("US-DEV-07 the checked functions still work and no longer leak: operator figures, friend shares", async () => {
    // owner_count policy: the operator overview counts every account only if the policy follows the owner.
    const overview = await withAccount(owner, anna, (c) =>
      c.query<{ accounts: number }>("select accounts from operator_overview(30)"),
    );
    expect(overview.rows[0]?.accounts).toBeGreaterThanOrEqual(3);
    await befriend(owner, anna, ben);
    await befriend(owner, cleo, anna);
    const own = await createFixtureSpecimen(owner, ben, "Bens Ableger", db.pool);
    const sharing = new SharingPostgres(owner);
    await sharing.set(ben, own, true, false);
    const foreign = await createFixtureSpecimen(owner, cleo, "Cleos Ableger", db.pool);
    await sharing.set(cleo, foreign, true, false);
    expect((await sharing.sharedBy(anna, ben)).map((r) => r.specimenId)).toEqual([own]);
  });
});
