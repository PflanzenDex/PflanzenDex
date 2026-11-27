import type { UserManager, User } from "oidc-client-ts";
import { runWithoutEndingStart } from "@/shared/ui/skeleton.delayed";
import { addressFromState, oidcSettings, returnAddress, returnState } from "./account-api";
import { shareSilentSignin } from "./renewal";

const env = import.meta.env as Record<string, string | undefined>;

// The sign-in library is about a seventh of the initial JavaScript; it loads as its own chunk, started at once
// (the loading state paints meanwhile) instead of travelling inside the entry chunk (US-QS-07, DS-08).
const library = import("oidc-client-ts");

export async function newManager(): Promise<UserManager> {
  const { UserManager: Manager, WebStorageStateStore } = await library;
  const manager = new Manager({
    ...oidcSettings(env, window.location.origin),
    // The sign-in stays on the device (US-ACC-01); revocable via "sign out on all devices".
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
  // The renewal runs once for all tabs and installed apps of the origin, not once per tab (issue 2274, renewal.ts).
  manager.signinSilent = shareSilentSignin(manager);
  return manager;
}

/** The key prefix under which the sign-in library keeps a signed-in user in `localStorage` (oidc-client-ts). */
const USER_KEY_PREFIX = "oidc.user:";

/** A kept user whose token has not run out (the library's own test: `expires_at` in seconds); unreadable counts as no. */
function liveUser(raw: string | null): boolean {
  try {
    const user = JSON.parse(raw ?? "null") as { expires_at?: unknown } | null;
    return typeof user?.expires_at === "number" && user.expires_at * 1000 > Date.now();
  } catch {
    return false;
  }
}

/**
 * Whether this device likely opens signed in (SG-STATE-02, issue 1876): a kept user whose token has not run out, or the
 * address is the return of a sign-in (`code` and `state`, as `processReturn` reads it). Read before the library has
 * loaded, so the start shows the signed-in frame from its first paint; it is a guess for the loading picture only, the
 * session check decides. Unreadable storage counts as no.
 */
export function likelySignedIn(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has("code") && q.has("state")) return true;
    const store = window.localStorage;
    return Object.keys(store).some(
      (key) => key.startsWith(USER_KEY_PREFIX) && liveUser(store.getItem(key)),
    );
  } catch {
    return false;
  }
}

// The address this page is at, as the sign-in returns to it (US-BES-17, #1619): the bare path, which is the redirect URI.
export const here = (): string => returnAddress(window.location.origin, window.location.pathname);

// The address this page is at with its query (US-BES-17, #1639): it goes along as the sign-in's state, see restoreAddress.
export const hereState = (): string =>
  returnState(window.location.origin, window.location.pathname, window.location.search);

// Puts the address back where the person was, without the sign-in's own parameters (US-BES-17, #1639). Without a usable
// state only the path stays, as before. The router was created at the callback's address and does not see a
// `replaceState`; a `popstate` makes it read the address again, so the layer or form of the query opens and a later
// navigation does not write the sign-in's parameters back (issue 1823). The history entry keeps the router's own state.
// That popstate is no page change of the keeper, so the app start goes on (issue 2244).
function restoreAddress(state: unknown): void {
  const address = addressFromState(window.location.origin, state) ?? new URL(here()).pathname;
  const entry: unknown = window.history.state;
  window.history.replaceState(entry, "", address);
  runWithoutEndingStart(() =>
    window.dispatchEvent(new PopStateEvent("popstate", { state: entry })),
  );
}

// The state of an error response of the sign-in library; anything else carries none.
const stateOf = (e: unknown): unknown =>
  typeof e === "object" && e !== null && "state" in e ? e.state : undefined;

// The redirect back from the sign-in service may be processed only once (React Strict Mode calls effects twice).
let callback: Promise<User | undefined> | null = null;
// The return of a refused check or another error. Only while it is in flight: the address is restored when it ends,
// so Strict Mode's second call waits for the first one instead of asking the library again.
let refusal: Promise<void> | null = null;

function refused(mgr: UserManager, hasState: boolean): Promise<void> {
  if (!hasState) {
    restoreAddress(undefined);
    return Promise.resolve();
  }
  // The library reads the return and throws its error response, which carries the state the sign-in was started with.
  refusal ??= Promise.resolve()
    .then(() => mgr.signinCallback())
    .then(
      (user) => restoreAddress(user?.state),
      (e: unknown) => restoreAddress(stateOf(e)),
    )
    .finally(() => {
      refusal = null;
    });
  return refusal;
}

const currentUser = (mgr: UserManager): Promise<User | undefined> =>
  mgr.getUser().then((u) => (u && !u.expired ? u : undefined));

export function processReturn(mgr: UserManager): Promise<User | undefined> {
  const q = new URLSearchParams(window.location.search);
  if (q.has("code") && q.has("state")) {
    callback ??= mgr.signinCallback().then((u) => u ?? undefined);
    return callback.then(
      (user) => {
        restoreAddress(user?.state);
        return user;
      },
      (e: unknown) => {
        restoreAddress(undefined);
        throw e;
      },
    );
  }
  if (q.has("error")) return refused(mgr, q.has("state")).then(() => currentUser(mgr));
  return currentUser(mgr);
}
