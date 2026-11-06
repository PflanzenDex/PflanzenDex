import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { UserManager, User } from "oidc-client-ts";
import { setProfileTimeZone } from "../shared/data";
import { clearPhotoCache } from "../shared/platform/browser/use-stored-photo";
import { signOutEverywhere, apiUrl, getAccount, type Account } from "./api/account-api";
import { newManager, processReturn } from "./api/sign-in-client";
import { texts } from "../shared/lib/text-rules/texts";
import table from "./views/views.de.json";

export type State =
  | { kind: "loading" }
  | { kind: "signedOut"; hint?: string; error?: string | undefined }
  /** Signed in at the sign-in service, but registration needs an invitation code (US-ACC-05). */
  | { kind: "invitationNeeded"; error?: string | undefined }
  | { kind: "signedIn"; account: Account; error?: string | undefined }
  | { kind: "error"; text: string };

const env = import.meta.env as Record<string, string | undefined>;
const MARKER = "pflanzendex.signed_out";
// Set before the one silent attempt per tab, so a refused attempt (`login_required`) can never loop.
const SILENT_TRIED = "pflanzendex.silent_tried";
// "Konto anlegen" (US-ACC-01): "check" during its silent check, "after_logout" while the session ends.
const REGISTER = "pflanzendex.register";
const t = texts(table);

// Once per tab, never after an explicit sign-out and never while the address still carries a result of the detour.
function shouldTrySilently(): boolean {
  const q = new URLSearchParams(window.location.search);
  if (q.has("code") || q.has("error")) return false;
  return !window.sessionStorage.getItem(MARKER) && !window.sessionStorage.getItem(SILENT_TRIED);
}

// Ends the session at the sign-in service; `then` says what the return does (see registerReturn).
function endSession(mgr: UserManager, then?: "after_logout"): Promise<void> {
  // On the way to the registration nobody signed out: the marker would stay in the tab of the new account.
  window.sessionStorage.setItem(then ? REGISTER : MARKER, then ?? "1");
  return mgr.signoutRedirect();
}

// The return of "Konto anlegen" (US-ACC-01), null if not about it: a live session ends first (id token: no logout page).
async function registerReturn(
  mgr: UserManager,
  intent: string | null,
  user: User | undefined,
  answered: boolean,
): Promise<State | null> {
  if (intent === "check" && answered) {
    if (user) await endSession(mgr, "after_logout");
    else await mgr.signinRedirect({ prompt: "create" });
    return { kind: "loading" };
  }
  if (intent === "after_logout" && !user) {
    await mgr.signinRedirect({ prompt: "create" });
    return { kind: "loading" };
  }
  return null;
}

async function loadState(mgr: UserManager): Promise<State> {
  try {
    // Read and cleared at once: Strict Mode runs the load twice, and only the first run acts on the intent.
    const intent = window.sessionStorage.getItem(REGISTER);
    window.sessionStorage.removeItem(REGISTER);
    const q = new URLSearchParams(window.location.search); // read before processReturn cleans the address
    const answered = q.has("code") || q.has("error");
    const user = await processReturn(mgr);
    const registering = await registerReturn(mgr, intent, user, answered);
    if (registering) return registering;
    if (!user) {
      if (shouldTrySilently()) {
        // A live session at the sign-in service (app token lost, other port, cleared site data) is picked up
        // without showing a login page (US-ACC-01); without one the service answers `login_required` at once.
        window.sessionStorage.setItem(SILENT_TRIED, "1");
        await mgr.signinRedirect({ prompt: "none" });
        return { kind: "loading" };
      }
      const hint = window.sessionStorage.getItem(MARKER) ? "Du bist abgemeldet." : undefined;
      return hint ? { kind: "signedOut", hint } : { kind: "signedOut" };
    }
    const account = await getAccount(apiUrl(env), user.access_token);
    // Phases, due dates and "today" are computed in the time zone of the profile (NFR-08, US-ACC-02).
    setProfileTimeZone(account.timeZone ?? null);
    return { kind: "signedIn", account };
  } catch (e) {
    if (e instanceof Error && e.message === "not_signed_in") {
      await mgr.removeUser();
      return { kind: "signedOut" };
    }
    if (e instanceof Error && e.message === "invitation_required")
      return { kind: "invitationNeeded" };
    return { kind: "error", text: "Das Konto konnte nicht geladen werden." };
  }
}

// The error of a sign-out sits on the screen the person pressed the button on; a state without that field stays as it is.
function withError(z: State, error: string | undefined): State {
  if (z.kind === "signedIn" || z.kind === "signedOut" || z.kind === "invitationNeeded")
    return { ...z, error };
  return z;
}

function sessionActions(manager: Promise<UserManager>, setState: Dispatch<SetStateAction<State>>) {
  // "Abmelden" and "Anderes Konto" end the session first: `prompt=login` would not help, because Keycloak refuses
  // another person while the first session is alive ("already signed in with another user", Keycloak 26.8).
  // A failure (the sign-in service unreachable, the sign-in library not loading) is said where the button was pressed
  // and the marker is as it was: this press signed nobody out, but a real sign-out before it still counts. Each press
  // starts without the old error and may retry.
  const signOut = () => {
    const signedOutBefore = window.sessionStorage.getItem(MARKER) !== null;
    setState((z) => withError(z, undefined));
    void manager
      .then((mgr) => endSession(mgr))
      .catch(() => {
        setState((z) => withError(z, t("signOut.failed")));
        if (!signedOutBefore) window.sessionStorage.removeItem(MARKER);
      });
  };
  return {
    signIn: () => {
      window.sessionStorage.removeItem(MARKER);
      void manager.then((mgr) => mgr.signinRedirect());
    },
    // "Konto anlegen": a silent check first (prompt=none), registerReturn continues (Keycloak refuses at the end).
    register: () => {
      window.sessionStorage.removeItem(MARKER);
      window.sessionStorage.setItem(REGISTER, "check");
      window.sessionStorage.setItem(SILENT_TRIED, "1");
      void manager.then((mgr) => mgr.signinRedirect({ prompt: "none" }));
    },
    signOut,
    useAnotherAccount: signOut,
    everywhereSignOut: async () => {
      setState((z) => withError(z, undefined));
      const mgr = await manager;
      const user = await mgr.getUser();
      try {
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

export function useSession() {
  const manager = useMemo(newManager, []);
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setState(await loadState(await manager));
  }, [manager]);

  useEffect(() => {
    void load();
    const ended = () =>
      setState({
        kind: "signedOut",
        hint: "Deine Sitzung wurde beendet. Bitte melde dich neu an.",
      });
    const listening = manager.then((mgr) => {
      mgr.events.addUserSignedOut(ended);
      mgr.events.addSilentRenewError(ended);
      return mgr;
    });
    return () => {
      void listening.then((mgr) => {
        mgr.events.removeUserSignedOut(ended);
        mgr.events.removeSilentRenewError(ended);
      });
    };
  }, [manager, load]);

  const token = useCallback(async () => (await (await manager).getUser())?.access_token, [manager]);
  const actions = useMemo(() => sessionActions(manager, setState), [manager]);

  return { state, token, reload: load, ...actions };
}
