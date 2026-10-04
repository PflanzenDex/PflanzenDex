import type { UserManagerSettings } from "oidc-client-ts";

export type Account = {
  id: string;
  email: string;
  displayName: string | null;
  emailConfirmed: boolean;
  mayShareWithFriends: boolean;
  /** Operator or reviewer: shows the review list of catalog proposals (US-BES-10). */
  reviewer?: boolean;
};

type Environment = Record<string, string | undefined>;
type FetchFn = typeof fetch;

/** Settings for the sign-in service (code flow with PKCE); defaults match `make auth-up`. */
export function oidcSettings(env: Environment, origin: string): UserManagerSettings {
  return {
    authority: env["VITE_OIDC_AUTHORITY"] ?? "http://localhost:18081/realms/pflanzendex",
    client_id: env["VITE_OIDC_CLIENT_ID"] ?? "pflanzendex-web",
    redirect_uri: `${origin}/`,
    post_logout_redirect_uri: `${origin}/`,
    response_type: "code",
    scope: "openid profile email",
    ui_locales: "de",
    automaticSilentRenew: true,
  };
}

export const apiUrl = (env: Environment): string => env["VITE_API_URL"] ?? "http://localhost:3000";

export async function getAccount(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Account> {
  const res = await fetchFn(`${api}/account`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error("not_signed_in");
  if (!res.ok) throw new Error("account_not_loadable");
  return (await res.json()) as Account;
}

/** "Sign out on all devices": ends all sessions of the account at the sign-in service (account API). */
export async function signOutEverywhere(
  authority: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<void> {
  const res = await fetchFn(`${authority}/account/sessions`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("sign_out_failed");
}
