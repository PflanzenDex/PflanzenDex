import { appError, failed, ok, type IdentityRemoval } from "@pflanzendex/core";
import type { IdentityAdminConfig } from "./identity-config";

// Removes a keeper's user at the sign-in service (US-ACC-04, issue 1673) through the admin REST interface of its realm,
// with a client credentials token of the service client. Nothing is read back and no realm is changed.

/** How long one call to the sign-in service may take before it counts as a failure (starting value, assumption). */
export const IDENTITY_TIMEOUT_MS = 15_000;

async function clientToken(config: IdentityAdminConfig, fetchFn: typeof fetch): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const r = await fetchFn(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`token request answered ${r.status}`);
  const answer = (await r.json()) as { access_token?: unknown };
  if (typeof answer.access_token !== "string") throw new Error("token answer without access token");
  return answer.access_token;
}

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
        const token = await clientToken(config, fetchFn);
        const r = await fetchFn(`${config.adminUrl}/users/${encodeURIComponent(subject)}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
        });
        if (r.status === 204 || r.status === 200 || r.status === 404) return ok("removed");
        return fail(new Error(`user delete answered ${r.status}`));
      } catch (cause) {
        return fail(cause);
      }
    },
  };
}
