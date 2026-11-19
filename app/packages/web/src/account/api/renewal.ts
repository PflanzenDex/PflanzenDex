import type { User, UserManager } from "oidc-client-ts";

// The sign-in library renews the access token by itself (automaticSilentRenew): when the token is due, its timer calls
// signinSilent. Every tab and installed app of the origin keeps its own timer, scheduled from the same stored token, so
// they fire together. The realm rotates refresh tokens (each one is accepted once): the first renewal stores a new refresh
// token, the second one presents the used token and is refused with invalid_grant, and that tab ended the session
// (issue 2274). The renewal therefore runs one at a time across the tabs (Web Locks), and a refusal counts as renewed when
// another tab has stored a new token meanwhile. Every other outcome stays as the library gives it.

/**
 * The renewal of a sign-in manager, shared with the other tabs and apps of the origin (issue 2274). The function replaces
 * the manager's signinSilent: the library calls it by name, so the automatic renewal uses it too.
 */
export function shareSilentSignin(mgr: UserManager): UserManager["signinSilent"] {
  const renew = mgr.signinSilent.bind(mgr);
  return (args) => {
    const once = () => renewIfDue(mgr, () => renew(args));
    // Web Locks are shared by the same origin's contexts (tabs, the installed app); without them (jsdom, old browsers)
    // the renewal runs in this tab alone, and the refusal recovery below still covers a second tab.
    const locks = navigator.locks;
    return locks ? locks.request(lockName(mgr), once) : once();
  };
}

// One lock per sign-in (authority and client), so the tabs of this origin queue behind each other.
const lockName = (mgr: UserManager): string =>
  `${mgr.settings.authority}|${mgr.settings.client_id} renew`;

// The stored token is renewed unless another tab has renewed it already: the library renews within its expiring window
// (accessTokenExpiringNotificationTimeInSeconds, 60 s by default), so a stored token with more left than that is new.
// Reading the user also starts this tab's timers from the stored token again (getUser).
async function renewIfDue(
  mgr: UserManager,
  renew: () => Promise<User | null>,
): Promise<User | null> {
  const stored = await mgr.getUser();
  if (
    stored &&
    (stored.expires_in ?? 0) > mgr.settings.accessTokenExpiringNotificationTimeInSeconds
  )
    return stored;
  try {
    return await renew();
  } catch (e) {
    // The refusal of a refresh token another tab has used since: the stored user carries the token that tab stored. Any
    // other end stays an end, so a session that really ended still shows the sign-in hint (P-10).
    const renewed = await mgr.getUser();
    if (
      isInvalidGrant(e) &&
      renewed &&
      !renewed.expired &&
      renewed.refresh_token !== stored?.refresh_token
    )
      return renewed;
    throw e;
  }
}

// The library's error response of a refused request (its class is not imported here, so the sign-in library stays in its
// own chunk; see sign-in-client.ts), by its marker and its OAuth error code.
function isInvalidGrant(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    e.name === "ErrorResponse" &&
    "error" in e &&
    e.error === "invalid_grant"
  );
}
