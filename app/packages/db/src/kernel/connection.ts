import pg from "pg";

// Default for the local test database from `make db-up`; CI sets the variable (E-01: self-hosting, Docker).
export const TEST_DB_STANDARD = "postgres://postgres:postgres@127.0.0.1:54329/pflanzendex_test";

/** Role that owns the schema in the test database: a plain login role, never a superuser (#294, QG-D1). */
export const TEST_OWNER_ROLE = "pflanzendex_test_owner";
const TEST_OWNER_SECRET = "test-owner-local-only"; // loopback test container only, never a real credential

/**
 * Superuser connection of the test cluster (`PFLANZENDEX_TEST_DATABASE_URL`, `make db-up`). Row-level security does
 * not apply to it. Use it only for what truly needs superuser rights: creating roles and scratch databases.
 */
export function testDatabaseUrl(): string {
  return process.env["PFLANZENDEX_TEST_DATABASE_URL"] ?? TEST_DB_STANDARD;
}

/** Name of the database that the non-superuser owner owns (the test database name plus `_owner`). */
export function testOwnerDatabaseName(): string {
  return `${new URL(testDatabaseUrl()).pathname.slice(1)}_owner`;
}

/**
 * Connection of the non-superuser owner of the test schema (#294, QG-D1). Production runs the same way: the owner of
 * the tables is no superuser, so row-level security applies to every query of the db suite.
 */
export function testOwnerUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.username = TEST_OWNER_ROLE;
  url.password = TEST_OWNER_SECRET;
  url.pathname = `/${testOwnerDatabaseName()}`;
  return url.toString();
}

export function openPool(url: string = testDatabaseUrl(), allowExitOnIdle = false): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 4, allowExitOnIdle });
}

/**
 * Pool of the db suite: connects as the non-superuser owner of the schema (#294, QG-D1), so row-level security
 * applies to every query exactly as in production. Needs `ensureTestOwnerDatabase()` (vitest global setup of `db`).
 */
export function openOwnerPool(): pg.Pool {
  return openPool(testOwnerUrl());
}

/** Superuser pool: only for roles, scratch databases and fixtures that need rights the owner must not have. */
export function openAdminPool(allowExitOnIdle = false): pg.Pool {
  return openPool(testDatabaseUrl(), allowExitOnIdle);
}

/**
 * Superuser pool on the SCHEMA database of the suite (the one `openOwnerPool()` uses). The only legitimate uses are test
 * fixtures that deliberately work across tenants or need superuser-only settings (`session_replication_role`):
 * see `fixtures.ts`. Never use it for the behaviour under test: that must run as the owner, under row security.
 */
export function openFixturePool(): pg.Pool {
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${testOwnerDatabaseName()}`;
  return openPool(url.toString(), true);
}

/**
 * Creates (idempotently, safe against two test processes at once) the non-superuser owner role and its database.
 * Runs once per test run from the vitest global setup; this is the only place that needs the superuser connection
 * for the normal suite. The application role is created here (cluster-wide) because only a superuser may create
 * it; the owner gets it with admin option so that migration 0001 (`grant pflanzendex_app to current_user`) works.
 */
export async function ensureTestOwnerDatabase(): Promise<void> {
  const admin = openAdminPool();
  const database = testOwnerDatabaseName();
  try {
    await admin.query("select pg_advisory_lock(hashtext('pflanzendex-test-owner'))");
    await admin.query(
      `do $$ begin
         if not exists (select from pg_roles where rolname = 'pflanzendex_app') then
           create role pflanzendex_app nologin;
         end if;
         if not exists (select from pg_roles where rolname = '${TEST_OWNER_ROLE}') then
           create role ${TEST_OWNER_ROLE} login nosuperuser nocreaterole nocreatedb nobypassrls password '${TEST_OWNER_SECRET}';
         end if;
       end $$`,
    );
    await admin.query(`grant pflanzendex_app to ${TEST_OWNER_ROLE} with admin option`);
    const exists = await admin.query("select 1 from pg_database where datname = $1", [database]);
    if (exists.rowCount === 0)
      await admin.query(`create database "${database}" owner ${TEST_OWNER_ROLE}`);
  } finally {
    await admin
      .query("select pg_advisory_unlock(hashtext('pflanzendex-test-owner'))")
      .catch(() => undefined);
    await admin.end();
  }
}
