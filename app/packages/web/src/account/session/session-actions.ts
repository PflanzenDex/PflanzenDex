import type { Dispatch, SetStateAction } from "react";
import type { UserManager } from "oidc-client-ts";
import { setProfileTimeZone } from "../../shared/data";
import { clearPhotoCache } from "../../shared/platform/browser/use-stored-photo";
import { signOutEverywhere } from "../api/account-api";
import { texts } from "../../shared/lib/text-rules/texts";
import table from "../views/views.de.json";
import type { State } from "./session";

// The sessionStorage keys of the sign-in (US-ACC-01). They live here because the actions write them and session.ts reads them.
export const MARKER = "pflanzendex.signed_out";
// Set before the one silent attempt per tab, so a refused attempt (`login_required`) can never loop.
export const SILENT_TRIED = "pflanzendex.silent_tried";
// "Konto anlegen" (US-ACC-01): "check" during its silent check, "after_logout" while the session ends.
export const REGISTER = "pflanzendex.register";

const t = texts(table);

// Ends the session at the sign-in service; `then` says what the return does (see registerReturn in session.ts).
export function endSession(mgr: UserManager, then?: "after_logout"): Promise<void> {
  // On the way to the registration nobody signed out: the marker would stay in the tab of the new account.
  window.sessionStorage.setItem(then ? REGISTER : MARKER, then ?? "1");
  return mgr.signoutRedirect();
}

// The error of a press sits on the screen the person pressed the button on; a state without that field stays as it is.
function withError(z: State, error: string | undefined): State {
  if (z.kind === "signedIn" || z.kind === "signedOut" || z.kind === "invitationNeeded")
    return { ...z, error };
  return z;
}

export function sessionActions(
  manager: Promise<UserManager>,
  setState: Dispatch<SetStateAction<State>>,
) {
  let detourRunning = false;
  // A press that starts a detour (US-ACC-01) restores the keys it may change when it fails and says so there.
  // A press during a detour is ignored. Released on success too: a back/forward return resolves the redirect (`pageshow`).
  const press = (keys: string[], failed: string, detour: (mgr: UserManager) => Promise<void>) => {
    if (detourRunning) return;
    detourRunning = true;
    const before = keys.map((key) => [key, window.sessionStorage.getItem(key)] as const);
    setState((z) => withError(z, undefined));
    void manager
      .then(detour)
      .catch(() => {
        for (const [key, value] of before)
          if (value === null) window.sessionStorage.removeItem(key);
          else window.sessionStorage.setItem(key, value);
        setState((z) => withError(z, failed));
      })
      .finally(() => (detourRunning = false));
  };
  return {
    signIn: () =>
      press([MARKER], t("signIn.failed"), (mgr) => {
        window.sessionStorage.removeItem(MARKER);
        return mgr.signinRedirect();
      }),
    // "Konto anlegen": a silent check first (prompt=none), registerReturn continues (Keycloak refuses at the end).
    register: () =>
      press([MARKER, REGISTER, SILENT_TRIED], t("register.failed"), (mgr) => {
        window.sessionStorage.removeItem(MARKER);
        window.sessionStorage.setItem(REGISTER, "check");
        window.sessionStorage.setItem(SILENT_TRIED, "1");
        return mgr.signinRedirect({ prompt: "none" });
      }),
    // "Abmelden" and "Anderes Konto" end the session first: prompt=login does not help while another session lives.
    signOut: () => press([MARKER], t("signOut.failed"), (mgr) => endSession(mgr)),
    useAnotherAccount: () => press([MARKER], t("signOut.failed"), (mgr) => endSession(mgr)),
    everywhereSignOut: async () => {
      setState((z) => withError(z, undefined));
      try {
        const mgr = await manager;
        const user = await mgr.getUser();
        if (user) await signOutEverywhere(mgr.settings.authority, user.access_token);
        await mgr.removeUser();
        setProfileTimeZone(null);
        clearPhotoCache(); // the page goes on: no picture of the signed-out keeper stays in memory (P-05)
        setState({ kind: "signedOut", hint: "Du bist auf allen Geräten abgemeldet." });
      } catch {
        setState((z) =>
          z.kind === "signedIn"
            ? { ...z, error: "Abmelden auf allen Geräten ist fehlgeschlagen." }
            : z,
        );
      }
    },
  };
}
