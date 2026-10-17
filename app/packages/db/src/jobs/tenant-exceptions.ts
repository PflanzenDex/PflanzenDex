import type { TenantExceptions } from "../kernel/index.ts";

// Tables of the module `jobs` without account id (FR-ACC-02, P-05), with the reason.
export const JOBS_TENANT_EXCEPTIONS: TenantExceptions = {
  withoutAccountId: {
    job: "Installation-level job queue (TE-06): no rights for the application role, only the worker (owner role) reads and writes it; the payload holds ids only and handlers reach user data through withAccount",
  },
  ruleRequired: [],
};
