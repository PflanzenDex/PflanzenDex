import type { UserManager, User } from "oidc-client-ts";
import { oidcSettings } from "./account-api";

const env = import.meta.env as Record<string, string | undefined>;

// The sign-in library is about a seventh of the initial JavaScript; it loads as its own chunk, started at once
// (the loading state paints meanwhile) instead of travelling inside the entry chunk (US-QS-07, DS-08).
const library = import("oidc-client-ts");

export async function newManager(): Promise<UserManager> {
  const { UserManager: Manager, WebStorageStateStore } = await library;
  return new Manager({
    ...oidcSettings(env, window.location.origin),
    // The sign-in stays on the device (US-ACC-01); revocable via "sign out on all devices".
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
}

// The redirect back from the sign-in service may be processed only once (React Strict Mode calls effects twice).
let callback: Promise<User | undefined> | null = null;
export function processReturn(mgr: UserManager): Promise<User | undefined> {
  const q = new URLSearchParams(window.location.search);
  if (q.has("code") && q.has("state")) {
    callback ??= mgr.signinCallback().then((u) => u ?? undefined);
    return callback.finally(() => window.history.replaceState({}, "", window.location.pathname));
  }
  if (q.has("error")) window.history.replaceState({}, "", window.location.pathname);
  return mgr.getUser().then((u) => (u && !u.expired ? u : undefined));
}
