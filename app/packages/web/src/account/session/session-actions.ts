import type { Dispatch, SetStateAction } from "react";
import type { User, UserManager } from "oidc-client-ts";
import { setProfileTimeZone, type ApiError, newRepeatKey, isUnanswered } from "../../shared/data";
import { SIGN_OUT_UNREACHABLE, signOutEverywhere } from "../api/account-api";
import { here, hereState } from "../api/sign-in-client";
import { texts } from "../../shared/lib/text-rules/texts";
import table from "../views/views.de.json";
import type { State } from "./session";

/** The sign-out-everywhere key of an open press: a lost answer is repeated under it (US-QS-03). */
let everywhereKey: string | null = null;

/** Ends the sessions on all devices; a lost answer repeats the press under its key (US-QS-03). */
async function endEverywhere(api: string, token: string) {
  const key = everywhereKey ?? newRepeatKey();
  const r = await signOutEverywhere(api, token, { key });
  everywhereKey = !r.ok && isUnanswered(r.error) ? key : null;
  return r;
}

// The sessionStorage keys of the sign-in (US-ACC-01). They live here because the actions write them and session.ts reads them.
export const MARKER = "pflanzendex.signed_out";
// Set before the one silent attempt per tab, so a refused attempt (`login_required`) can never loop.
export const SILENT_TRIED = "pflanzendex.silent_tried";
// The intent of a detour to a sign-in form (US-ACC-01), read and cleared by its return in session.ts: "Konto anlegen" sets
// "check" during its silent check and "after_logout" while the session ends; "Konto wechseln" sets "after_switch" while
// its session ends. The key keeps its name, so a detour in flight during a deploy still finds it.
export const REGISTER = "pflanzendex.register";
// Set when this tab knows of a live session at the sign-in service: "Konto wechseln" shows only then (US-QS-32).
export const LIVE = "pflanzendex.live_session";

const t = texts(table);

// Once per tab, never after an explicit sign-out and never while the address still carries a result of the detour.
export function shouldTrySilently(): boolean {
  const q = new URLSearchParams(window.location.search);
  if (q.has("code") || q.has("error")) return false;
  return !window.sessionStorage.getItem(MARKER) && !window.sessionStorage.getItem(SILENT_TRIED);
}

// Ends the session at the sign-in service; `then` says what the return does (registerReturn and switchReturn in session.ts).
export function endSession(
  mgr: UserManager,
  then?: "after_logout" | "after_switch",
): Promise<void> {
  // On the way to a sign-in form nobody signed out: the marker would stay in the tab and show "Du bist abgemeldet.".
  window.sessionStorage.setItem(then ? REGISTER : MARKER, then ?? "1");
  // The session ends here, so this tab no longer knows of a live one.
  window.sessionStorage.removeItem(LIVE);
  return mgr.signoutRedirect();
}

// "Konto wechseln" ends the session first, and its return opens the sign-in form for the other account (owner decision
// 2026-11-14). The silent flag is set first, so that return never attempts silently, as for "Konto anlegen".
function endForSwitch(mgr: UserManager): Promise<void> {
  window.sessionStorage.setItem(SILENT_TRIED, "1");
  return endSession(mgr, "after_switch");
}

// The error of a press sits on the screen the person pressed the button on; a state without that field stays as it is.
function withError(z: State, error: string | undefined): State {
  if (z.kind === "signedIn" || z.kind === "signedOut" || z.kind === "invitationNeeded")
    return { ...z, error };
  return z;
}

// The busy mark of "Auf allen Geräten abmelden" sits on the signed-in state only (US-ACC-01).
function withBusy(z: State, busy: boolean): State {
  return z.kind === "signedIn" ? { ...z, everywhereBusy: busy } : z;
}

// The failure of "Auf allen Geräten abmelden" has its own field, so only its alert offers the retry that repeats it (US-QS-32).
function withEverywhereError(z: State, error: string | undefined): State {
  return z.kind === "signedIn" ? { ...z, everywhereError: error } : z;
}

// The stored sign-in for a sign-out. An expired access token is renewed once, silently, first; a renewal that fails leaves no
// user, which the caller reports as the error of the dialog (US-ACC-01).
async function signedInUser(mgr: UserManager): Promise<User | null | undefined> {
  const user = await mgr.getUser();
  return user?.expired ? mgr.signinSilent().catch(() => undefined) : user;
}

// What a sign-out at the sign-in service leaves in this tab: the stored sign-in, the live flag (the API ended every session
// there, US-QS-32), the time zone and the photos. The page goes on, so no picture of the signed-out keeper stays in memory (P-05).
async function forgetSignIn(mgr: UserManager): Promise<void> {
  await mgr.removeUser();
  window.sessionStorage.removeItem(LIVE);
  setProfileTimeZone(null);
  // The photo module is loaded here, not at the start (DS-08); a module never loaded has an empty cache, so a failed import loses nothing.
  void import("../../shared/platform/browser/use-stored-photo").then(
    (m) => m.clearPhotoCache(),
    () => undefined,
  );
}

// The text of a failed sign-out, chosen by code: no answer says the connection is missing, a server text is shown as it is,
// and an answer without text falls back to the generic failure (US-ACC-01, SG-STATE-03).
function everywhereText(error: ApiError): string {
  if (error.code === SIGN_OUT_UNREACHABLE) return t("everywhere.offline");
  return error.text || t("everywhere.failed");
}

export function sessionActions(
  manager: Promise<UserManager>,
  setState: Dispatch<SetStateAction<State>>,
  api: string,
) {
  let detourRunning = false;
  // A press while "Auf allen Geräten abmelden" runs does nothing: the request is sent once (US-ACC-01).
  let everywhereRunning = false;
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
        return mgr.signinRedirect({ redirect_uri: here(), state: hereState() });
      }),
    // "Konto anlegen": a silent check first (prompt=none), registerReturn continues (Keycloak refuses at the end).
    register: () =>
      press([MARKER, REGISTER, SILENT_TRIED], t("register.failed"), (mgr) => {
        window.sessionStorage.removeItem(MARKER);
        window.sessionStorage.setItem(REGISTER, "check");
        window.sessionStorage.setItem(SILENT_TRIED, "1");
        return mgr.signinRedirect({ prompt: "none" });
      }),
    // "Abmelden" ends the session first: prompt=login does not help while another session lives.
    signOut: () => press([MARKER, LIVE], t("signOut.failed"), (mgr) => endSession(mgr)),
    switchAccount: () =>
      press([MARKER, LIVE, REGISTER, SILENT_TRIED], t("signOut.failed"), endForSwitch),
    // "Auf allen Geräten abmelden" (US-ACC-01, issue 2065): the API ends every session first. The local sign-in is removed
    // only after that succeeded; a failure keeps the dialog open with the text of its code, so the keeper can press again.
    everywhereSignOut: async () => {
      if (everywhereRunning) return;
      everywhereRunning = true;
      setState((z) => withBusy(withEverywhereError(withError(z, undefined), undefined), true));
      const showError = (text: string) =>
        setState((z) => withBusy(withEverywhereError(z, text), false));
      try {
        const mgr = await manager;
        const user = await signedInUser(mgr);
        // Without a stored sign-in there is no token to end the sessions with; a success here would claim what did not happen.
        if (!user) return showError(t("everywhere.failed"));
        const r = await endEverywhere(api, user.access_token);
        if (!r.ok) return showError(everywhereText(r.error));
        await forgetSignIn(mgr);
        setState({ kind: "signedOut", hint: "Du bist auf allen Geräten abgemeldet." });
      } catch {
        showError(t("everywhere.failed"));
      } finally {
        everywhereRunning = false;
      }
    },
  };
}
