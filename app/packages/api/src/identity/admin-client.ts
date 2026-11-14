import type { IdentityAdminConfig } from "./identity-config";

// The sign-in service's admin interface (US-ACC-04, US-ACC-01): one client-credentials token of the service client per
// call, then the request. The token and the answers never leave this module; the callers name only what they ask for.

/** How long one call to the sign-in service may take before it counts as a failure (starting value, assumption). */
const IDENTITY_TIMEOUT_MS = 15_000;

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
 * One request to the realm's admin base with the service token. `path` starts with `/` and is appended to the admin base.
 * Resolves with the service's answer, whatever its status; a refused token or an unreachable service throws.
 */
export async function adminRequest(
  config: IdentityAdminConfig,
  fetchFn: typeof fetch,
  method: "DELETE" | "POST",
  path: string,
): Promise<Response> {
  const token = await clientToken(config, fetchFn);
  return fetchFn(`${config.adminUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
  });
}
