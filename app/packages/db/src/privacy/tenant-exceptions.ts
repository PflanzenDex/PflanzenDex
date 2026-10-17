import type { TenantExceptions } from "../kernel/index.ts";

// `deletion_log` has no account id: the account is gone when the row is written. Like `invitation` it is closed to the
// application role; `schema-check.ts` composes this into the check.
export const PRIVACY_TENANT_EXCEPTIONS: TenantExceptions = {
  withoutAccountId: {
    deletion_log:
      "One anonymous row per finished deletion of an account (US-ACC-04): when it was requested and finished and, until the operator has removed the identity at the sign-in service, the sign-in subject. No rights for the application role; written by erase_account() and read and closed by the operator with the owner connection",
  },
  ruleRequired: [],
};
