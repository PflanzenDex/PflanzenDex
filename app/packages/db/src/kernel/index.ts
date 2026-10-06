// Public interface of the `kernel` module (ADR 0003): tenant access, connection, migrations, idempotency.
export { withAccount, asAccount } from "./tenant.ts";
export { migrate, MIGRATIONS_DIRECTORY, type MigrationsOptions } from "./migrate.ts";
export { checkSchema, tenantsTables, WITHOUT_ACCOUNT_ID } from "./schema.ts";
export type { TenantExceptions } from "./schema.ts";
export { checkTenantIsolation, type FixtureContext, type Fixtures } from "./isolation.ts";
export {
  ensureTestOwnerDatabase,
  openAdminPool,
  openEnsuredOwnerPool,
  openFixturePool,
  openOwnerPool,
  openPool,
  testDatabaseUrl,
} from "./connection.ts";
export { IdempotencyPostgres } from "./idempotency.ts";
export { FIXTURES_KERNEL } from "./fixtures.ts";
