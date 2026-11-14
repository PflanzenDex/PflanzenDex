import type { IdentityAdminConfig } from "./identity-config";

// The sign-in service's admin interface (US-ACC-04, US-ACC-01): one client-credentials token of the service client per
// call, then the request. The token and the answers never leave this module; the callers name only what they ask for.

/**
 * The total time of one call to the sign-in service, the token request and the request together (starting value,
 * assumption). It stays below the 15 s the browser gives the sign-out request (`REQUEST_TIMEOUT_SECONDS` in
 * web/src/account/api/account-api.ts), so the server ends or gives up before the browser reports a failure.
 */
export const IDENTITY_BUDGET_MS = 10_000;

async function clientToken(
  config: IdentityAdminConfig,
  fetchFn: typeof fetch,
  signal: AbortSignal,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const r = await fetchFn(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal,
  });
  if (!r.ok) throw new Error(`token request answered ${r.status}`);
  const answer = (await r.json()) as { access_token?: unknown };
  if (typeof answer.access_token !== "string") throw new Error("token answer without access token");
  return answer.access_token;
}

/**
 * One request to the realm's admin base with the service token. `path` starts with `/` and is appended to the admin base.
 * The token request and the request share one deadline (`IDENTITY_BUDGET_MS`). Resolves with the service's answer,
 * whatever its status; a refused token, an unreachable service or the deadline throws.
 */
export async function adminRequest(
  config: IdentityAdminConfig,
  fetchFn: typeof fetch,
  method: "DELETE" | "POST",
  path: string,
): Promise<Response> {
  const signal = AbortSignal.timeout(IDENTITY_BUDGET_MS);
  const token = await clientToken(config, fetchFn, signal);
  return fetchFn(`${config.adminUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    signal,
  });
}
