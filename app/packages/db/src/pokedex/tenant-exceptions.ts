import type { TenantExceptions } from "../kernel/index.ts";

// Tables of the module `pokedex` without account id (FR-ACC-02, P-05), with the reason.
export const POKEDEX_TENANT_EXCEPTIONS: TenantExceptions = {
  withoutAccountId: {
    taxon_attribute:
      "Researched species attributes (US-ENT-09, DM-ENT-01): public botanical facts with source, link and license per field, no user data; read-only for the application role, written only by the worker (owner role)",
    taxon:
      "Shared taxonomy tree built from the shared species catalog (US-POK-03, E-02): public botanical facts with their source, no user data; read-only for the application role, written only by the build job (owner role)",
  },
  ruleRequired: [],
};
