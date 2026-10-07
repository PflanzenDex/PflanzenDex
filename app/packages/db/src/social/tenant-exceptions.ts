import type { TenantExceptions } from "../kernel/index.ts";

// `friend_code` has no account id: a code is looked up by its hash across all accounts, which a row rule on the owner
// cannot allow. Like `invitation` it is closed to the application role; `schema-check.ts` composes this into the check.
export const SOCIAL_TENANT_EXCEPTIONS: TenantExceptions = {
  withoutAccountId: {
    friend_code:
      "Friend codes (US-SOZ-01) are looked up by hash across all accounts: no rights for the application role; created through create_friend_code() and redeemed through request_friendship(), both for the calling account only. Only hashes are stored",
  },
  ruleRequired: [],
};
