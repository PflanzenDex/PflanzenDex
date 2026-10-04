import type { UserManagerSettings } from "oidc-client-ts";
import { call, createWrite, type Response } from "../kernel";

export type Account = {
  id: string;
  email: string;
  displayName: string | null;
  timeZone: string | null;
  emailConfirmed: boolean;
  mayShareWithFriends: boolean;
  /** Operator or reviewer: shows the review list of catalog proposals (US-BES-10). */
  reviewer?: boolean;
  /** The operator: shows the operator area (US-ACC-05). Only a hint; the server checks the role again. */
  operator?: boolean;
};

export const OCCASIONS = [
  "phase",
  "treatment",
  "measurement",
  "watering",
  "swap",
  "friends",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

/** Profile and settings (US-ACC-02); the same shape the API returns and takes. */
export type AccountProfile = {
  displayName: string | null;
  timeZone: string | null;
  everythingPrivate: boolean;
  noRecommendations: boolean;
  notifications: Record<Occasion, boolean>;
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

/** Whether the 403 means "registration needs an invitation code" (US-ACC-05), judged by the code, never by the text. */
async function invitationRequired(res: globalThis.Response): Promise<boolean> {
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
  return body.error?.code === "invitation.required";
}

export async function getAccount(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Account> {
  const res = await fetchFn(`${api}/account`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error("not_signed_in");
  if (res.status === 403 && (await invitationRequired(res))) throw new Error("invitation_required");
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

export const loadProfile = (
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<AccountProfile>> => call(fetchFn, `${api}/account/profile`, token);

/** Saves the profile as a whole; the repeat-guard key is created per call. */
export async function saveProfile(
  api: string,
  token: string,
  profile: AccountProfile,
  fetchFn: FetchFn = fetch,
): Promise<Response<AccountProfile>> {
  const r = await createWrite(api, token, fetchFn)("PUT", "/account/profile", profile);
  return r.ok ? { ok: true, value: r.value as AccountProfile } : r;
}
