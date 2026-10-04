import type { UserManagerSettings } from "oidc-client-ts";

export type Account = {
  id: string;
  email: string;
  displayName: string | null;
  emailConfirmed: boolean;
  mayShareWithFriends: boolean;
};

export type NotificationPreference = {
  enabled: boolean;
  time?: string;
};

export type NotificationSettings = {
  phase?: NotificationPreference;
  treatment?: NotificationPreference;
  measurement?: NotificationPreference;
  watering?: NotificationPreference;
  swap?: NotificationPreference;
  friends?: NotificationPreference;
};

export type AccountProfile = {
  displayName: string | null;
  timeZone: string | null;
  everythingPrivate: boolean;
  noRecommendations: boolean;
  notificationSettings: NotificationSettings | null;
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

export async function getProfile(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<AccountProfile> {
  const res = await fetchFn(`${api}/account/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("not_signed_in");
  if (!res.ok) throw new Error("profile_not_loadable");
  return (await res.json()) as AccountProfile;
}

export async function updateProfile(
  api: string,
  token: string,
  updates: Partial<AccountProfile>,
  fetchFn: FetchFn = fetch,
): Promise<AccountProfile> {
  const res = await fetchFn(`${api}/account/profile`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });
  if (res.status === 401) throw new Error("not_signed_in");
  if (res.status === 400) {
    const error = await res.json();
    throw new Error(error.error?.code ?? "input_invalid");
  }
  if (!res.ok) throw new Error("profile_update_failed");
  return (await res.json()) as AccountProfile;
}
