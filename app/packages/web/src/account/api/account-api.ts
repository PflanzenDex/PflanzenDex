import type { UserManagerSettings } from "oidc-client-ts";
import { call, createWrite, type Response } from "../../shared/data";

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
  /** Which function groups are on for this account (US-DEV-06); absent counts as on. */
  features?: { social: boolean; ai: boolean; recommendations: boolean };
  /** How the keyboard shortcuts are taken (US-QS-11): all, only with Alt+Shift, or none; absent means none is known. */
  keyboardShortcuts?: "plain" | "modifier" | "disabled";
  /** Motion of the app (US-QS-33): `system` follows the device, `reduced` is "Bewegung aus"; absent counts as `system`. */
  motion?: "system" | "reduced";
};

export const OCCASIONS = [
  "phase",
  "treatment",
  "measurement",
  "watering",
  "swap",
  "friends",
  "equipment",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

/** Profile and settings (US-ACC-02); the same shape the API returns and takes. */
export type AccountProfile = {
  displayName: string | null;
  timeZone: string | null;
  everythingPrivate: boolean;
  noRecommendations: boolean;
  notifications: Record<Occasion, boolean>;
  /** Open wishlist candidates per zone 2 to 4 below which the wishlist warns (US-WUN-02). */
  replenishBuffer: number;
  /** The collection counts in the rarity in PflanzenDex (US-POK-14); off until switched on. */
  rarityConsent: boolean;
  /** Lux lower bounds of the four closest positions in the light overview (US-LIC-03); `null` = standard values. */
  positionThresholds: number[] | null;
  /** How the keyboard shortcuts are taken (US-QS-11): all of them, only with Alt+Shift, or none. */
  keyboardShortcuts: "plain" | "modifier" | "disabled";
  /** Motion of the app (US-QS-33): follow the device, or "Bewegung aus". */
  motion: "system" | "reduced";
};

type Environment = Record<string, string | undefined>;
type FetchFn = typeof fetch;

/**
 * A request to the sign-in service (discovery, token exchange, sign-out there) or to our own API (the account load)
 * gives up after this many seconds, so an unanswering service shows its error instead of a loading state (US-ACC-01).
 * Starting value, assumption.
 */
export const REQUEST_TIMEOUT_SECONDS = 15;

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
    requestTimeoutInSeconds: REQUEST_TIMEOUT_SECONDS,
  };
}

/**
 * The address the sign-in returns to: the path the person is on (US-BES-17, #1619). Same origin only: a path like
 * `//evil.example/x` or `/\evil.example` resolves to another origin and falls back to the start page. The query and the
 * hash are dropped, because the callback adds its own.
 */
export function returnAddress(origin: string, pathname: string): string {
  const url = new URL(pathname, origin);
  return url.origin === origin ? `${origin}${url.pathname}` : `${origin}/`;
}

// The parameters the sign-in adds to an address; they never go back into it (US-BES-17, #1639).
const SIGN_IN_PARAMS = ["code", "state", "session_state", "iss", "error", "error_description"];

// Only a path with one leading slash stays on this origin: `//host` and `/\host` lead to another host.
function sameOriginAddress(origin: string, address: string): string | undefined {
  if (!address.startsWith("/") || address.startsWith("//") || address.startsWith("/\\"))
    return undefined;
  const url = new URL(address, origin);
  return url.origin === origin ? `${url.pathname}${url.search}` : undefined;
}

/**
 * The address a sign-in is started for, with its query (US-BES-17, #1639). It travels as the sign-in's state and comes back
 * with the callback, because the redirect URI must stay the bare path. An address that leads elsewhere gives the start page.
 */
export function returnState(origin: string, pathname: string, search: string): string {
  return sameOriginAddress(origin, `${pathname}${search}`) ?? "/";
}

/**
 * The address a sign-in returns to, read from the state it came back with (US-BES-17, #1639): the path and the query of this
 * origin, without the sign-in's own parameters. `undefined` when the state is not such an address (another origin, `//host`,
 * an absolute URL, `javascript:`, anything that is not text), so the caller falls back to the path.
 */
export function addressFromState(origin: string, state: unknown): string | undefined {
  if (typeof state !== "string") return undefined;
  const address = sameOriginAddress(origin, state);
  if (address === undefined) return undefined;
  const url = new URL(address, origin);
  for (const param of SIGN_IN_PARAMS) url.searchParams.delete(param);
  return `${url.pathname}${url.search}`;
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
  const res = await fetchFn(`${api}/account`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_SECONDS * 1000),
  });
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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_SECONDS * 1000),
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
