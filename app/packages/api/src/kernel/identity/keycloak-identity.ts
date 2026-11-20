import { appError, failed, ok, type IdentityRemoval } from "@pflanzendex/core";
import { adminRequest } from "./admin-client";
import type { IdentityAdminConfig } from "./identity-config";

// Removes a keeper's user at the sign-in service (US-ACC-04, issue 1673) through the admin REST interface of its realm,
// with a client credentials token of the service client. Nothing is read back and no realm is changed.

/**
 * `removed` when the user is deleted (204) or was already gone (404: nothing is left to remove, so repeating is harmless).
 * Every other answer and every failure to reach the service is the error `privacy.identity_removal_failed`: the job retries
 * and nothing is erased before (P-10). The cause is kept for the log; no secret leaves this function.
 */
export function keycloakIdentityRemoval(
  config: IdentityAdminConfig,
  fetchFn: typeof fetch = fetch,
): IdentityRemoval {
  const fail = (cause: unknown) => failed(appError("privacy.identity_removal_failed", { cause }));
  return {
    async remove(subject) {
      try {
        const r = await adminRequest(
          config,
          fetchFn,
          "DELETE",
          `/users/${encodeURIComponent(subject)}`,
        );
        if (r.status === 204 || r.status === 200 || r.status === 404) return ok("removed");
        return fail(new Error(`user delete answered ${r.status}`));
      } catch (cause) {
        return fail(cause);
      }
    },
  };
}
