import type { Pool } from "pg";
import { FIXTURE_SPECIES_ID, FIXTURES_COLLECTION, SpecimenPostgres } from "./collection/index.ts";
import { FIXTURES_CATALOG } from "./catalog/index.ts";
import { FIXTURES_KERNEL, openFixturePool, withAccount, type Fixtures } from "./kernel/index.ts";
import { FIXTURES_ACCOUNT } from "./account/index.ts";
import { FIXTURES_LIGHT } from "./light/index.ts";
import { FIXTURES_CARE } from "./care/index.ts";
import { FIXTURES_WISHLIST } from "./wishlist/index.ts";
import { FIXTURES_SOCIAL } from "./social/index.ts";

// One example per table with an account id for the remaining columns (without the id, the test sets it).
// The entries live in their respective module; they are collected here. A new table without an entry
// makes the generic tenant test fail (FR-QG-07).
export const FIXTURES: Fixtures = {
  ...FIXTURES_KERNEL,
  ...FIXTURES_ACCOUNT,
  ...FIXTURES_CATALOG,
  ...FIXTURES_LIGHT,
  ...FIXTURES_COLLECTION,
  ...FIXTURES_CARE,
  ...FIXTURES_WISHLIST,
  ...FIXTURES_SOCIAL,
};

// Test helpers for tables of another module (AB-9): tests of one module write no SQL on foreign tables,
// they call these helpers. Role assignment is the operator's job in operation (TE-08), not the application's.
export const assignRole = (pool: Pool, account: string, role: "operator" | "reviewer") =>
  pool.query("insert into account_role (account, role) values ($1, $2)", [account, role]);

/** An account with its data row and display name (AB-9: tests of foreign modules write no SQL on `account_data`). */
export const createAccountWithName = (pool: Pool, id: string, name: string | null) =>
  withAccount(pool, id, async (c) => {
    await c.query("insert into account (id) values ($1) on conflict do nothing", [id]);
    await c.query(
      "insert into account_data (account_id, email, display_name) values ($1, $2, $3)",
      [id, `${id}@example.test`, name],
    );
  });

/** The application role may neither read nor write the role table (both must fail with `permission denied`). */
export const readRoleTable = (pool: Pool, account: string) =>
  withAccount(pool, account, (c) => c.query("select * from account_role"));
export const writeInRoleTable = (pool: Pool, account: string) =>
  withAccount(pool, account, (c) =>
    c.query("insert into account_role (account, role) values ($1, 'operator')", [account]),
  );

// The helpers below deliberately work across tenants (or need superuser-only settings), which the non-superuser owner
// of the suite cannot do under row security (#294, QG-D1). They use one shared superuser pool; everything else in the
// suite, in particular the behaviour under test, runs as the owner.
let fixturePool: Pool | undefined;
const fixtures = (): Pool => (fixturePool ??= openFixturePool());

// Fixed example species for tables that point to the catalog by foreign key (AB-10, global reference table `species`).
// It belongs to an own account and is a private proposal, so nobody else sees it. Idempotent and stays in place:
// deleting an account must not take a used species with it because of `on delete restrict`.
const FIXTURE_SPECIES_ACCOUNT = "00000000-0000-4000-8000-00000000fa02";

export async function createFixtureSpeciesAt(): Promise<string> {
  // Every statement is repeatable on its own (on conflict do nothing), parallel test files do not disturb each other.
  await fixtures().query("insert into account (id) values ($1) on conflict do nothing", [
    FIXTURE_SPECIES_ACCOUNT,
  ]);
  await fixtures().query(
    `insert into review_case (account_id, object_kind, object_id, status)
     values ($1, 'species', $2, 'proposal') on conflict do nothing`,
    [FIXTURE_SPECIES_ACCOUNT, FIXTURE_SPECIES_ID],
  );
  await fixtures().query(
    `insert into species (id, genus, latin_name, difficulty, standard_level, light_demand_lux,
       growth_measure, etiolation_signs, success_criteria, created_by)
     values ($1, 'Fixtureus', 'Fixtureus tenant_test', 1, 2, 100, 'height', 'v', 'e', 'user')
     on conflict do nothing`,
    [FIXTURE_SPECIES_ID],
  );
  return FIXTURE_SPECIES_ID;
}

/** A specimen of the fixture species for the account (AB-9: tests of foreign modules write no SQL on `specimen`). */
export async function createFixtureSpecimen(
  pool: Pool,
  account: string,
  name: string,
): Promise<string> {
  const r = await new SpecimenPostgres(pool).create(account, {
    speciesId: await createFixtureSpeciesAt(),
    name,
    marker: null,
    locationId: null,
    caughtAt: "2026-10-03",
  });
  if (typeof r === "string") throw new Error(r);
  return r.id;
}

/** Deleting a species with owner rights and as the application (AB-9: tests of foreign modules write no SQL on `species`). */
export const deleteSpecies = (speciesId: string) =>
  fixtures().query("delete from species where id = $1", [speciesId]);
export const deleteSpeciesAsApplication = (pool: Pool, account: string, speciesId: string) =>
  withAccount(pool, account, (c) => c.query("delete from species where id = $1", [speciesId]));
export const speciesExists = async (speciesId: string) =>
  ((await fixtures().query("select 1 from species where id = $1", [speciesId])).rowCount ?? 0) ===
  1;

/** The review case of a catalog object (AB-9: tests of foreign modules write no SQL on `review_case`). */
export const reviewCaseIdOf = async (objectId: string): Promise<string> =>
  (
    await fixtures().query<{ id: string }>("select id from review_case where object_id = $1", [
      objectId,
    ])
  ).rows[0]?.id ?? "";

/**
 * Deletes the given accounts together with the species and review cases they created. Catalog and review case point to
 * each other (a species needs its case, a merged case names its target), so the foreign keys are switched off while
 * the species go; afterwards the accounts are deleted normally, which cascades to their specimens and care profiles.
 * One transaction, so no other test ever sees the dangling state (tests only, owner rights).
 */
export async function deleteAccountsWithCatalog(accounts: readonly string[]): Promise<void> {
  const client = await fixtures().connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(
      "delete from species where id in (select object_id from review_case where account_id = any($1))",
      [accounts],
    );
    await client.query("set local session_replication_role = default");
    await client.query("delete from account where id = any($1)", [accounts]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
