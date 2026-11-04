// Public interface of the `kernel` module (ADR 0003): tenant access, connection, migrations, idempotency.
export { withAccount, withLongAccount, asAccount, enterApplicationRole } from "./tenant.ts";
export {
  isDatabaseUnavailable,
  LONG_LIMITS,
  PRODUCTION_POOL_MAX,
  poolConfigFromEnv,
  poolLimits,
  REQUEST_LIMITS,
  type DbLimits,
  type PoolConfig,
} from "./connection/limits.ts";
export { migrate, MIGRATIONS_DIRECTORY, type MigrationsOptions } from "./migrate.ts";
export { checkSchema, tenantsTables, WITHOUT_ACCOUNT_ID } from "./schema.ts";
export type { TenantExceptions } from "./schema.ts";
export {
  checkTenantIsolation,
  fillAccountWithFixtures,
  type FixtureContext,
  type Fixtures,
} from "./isolation.ts";
export {
  ensureTestOwnerDatabase,
  holdTaxonLock,
  openAdminPool,
  openFixturePool,
  openOwnerPool,
  openPool,
  testDatabaseUrl,
  testOwnerUrl,
} from "./connection/connection.ts";
export { IdempotencyPostgres } from "./idempotency.ts";
export {
  checkDbRoles,
  dbRoleFindings,
  roleCheckMode,
  type RoleCheckMode,
} from "./connection/role-check.ts";
export { FIXTURES_KERNEL } from "./fixtures.ts";
