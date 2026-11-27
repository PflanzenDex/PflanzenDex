import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assignRole,
  createAccountWithName,
  createSuperuserOwnerDatabase,
  type SuperuserOwnerDatabase,
} from "./fixtures.ts";
import { dbRoleFindings } from "./kernel/connection/role-check.ts";
import { migrate, openPool, testDatabaseUrl } from "./kernel/index.ts";

// #907, US-DEV-07, P-04, d-130: an existing database that was created and migrated by the cluster superuser is handed to a
// plain owner role (deploy: app/config/deploy/docker/db-roles/). Since the squash (issue 2519) the superuser era is the
// baseline applied as superuser: the test builds that state, moves the ownership and lets the owner open the database.
// Reduced against the chain: the owner-bound row rules (`to current_user`) stay on the superuser that applied the baseline,
// because transfer-ownership.sql does not re-target policies yet (the chain did that in 0094). The checked functions are
// therefore not called here; the owner tests of the suite cover them on a database the owner built.
const TRANSFER = readFileSync(
  new URL("../../../config/deploy/docker/db-roles/transfer-ownership.sql", import.meta.url),
  "utf8",
);
const OWNER = `ownsw_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
const PASSWORD = "owner-switch-local-only"; // loopback test container only, never a real credential
let db: SuperuserOwnerDatabase;
let owner: Pool | undefined;
const [anna, ben, cleo] = [randomUUID(), randomUUID(), randomUUID()];

beforeAll(async () => {
  db = await createSuperuserOwnerDatabase("ownersw");
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

  it("US-DEV-07 the owner opens the transferred database: no migration is pending and the start-up role check is clean", async () => {
    const url = new URL(testDatabaseUrl());
    url.username = OWNER;
    url.password = PASSWORD;
    url.pathname = new URL(db.url).pathname;
    owner = openPool(url.toString());
    owner.on("error", () => undefined);
    expect(await migrate(owner)).toEqual([]);
    expect(await dbRoleFindings(owner)).toEqual([]);
  });
});
