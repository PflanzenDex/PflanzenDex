import type { Pool, PoolClient } from "pg";
import { CATALOG_TENANT_EXCEPTIONS } from "./catalog/index.ts";
import { JOBS_TENANT_EXCEPTIONS } from "./jobs/index.ts";
import { checkSchema, WITHOUT_ACCOUNT_ID, type TenantExceptions } from "./kernel/index.ts";

// Composition root of the schema check (ADR 0003): the kernel checks, the modules contribute their exceptions.
const EXCEPTIONS: TenantExceptions = {
  withoutAccountId: {
    ...WITHOUT_ACCOUNT_ID,
    ...CATALOG_TENANT_EXCEPTIONS.withoutAccountId,
    ...JOBS_TENANT_EXCEPTIONS.withoutAccountId,
  },
  ruleRequired: [...CATALOG_TENANT_EXCEPTIONS.ruleRequired],
};

/** Violations of the tenant rules in the schema (and, with the register, of the module boundaries); empty means fine. */
export const findSchemaViolations = (
  db: Pool | PoolClient,
  register?: Parameters<typeof checkSchema>[2],
): Promise<string[]> => checkSchema(db, EXCEPTIONS, register);
