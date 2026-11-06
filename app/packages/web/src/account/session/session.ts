import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserManager, User } from "oidc-client-ts";
import { setProfileTimeZone } from "../../shared/data";
import { apiUrl, getAccount, type Account } from "../api/account-api";
import { newManager, processReturn } from "../api/sign-in-client";
import { MARKER, REGISTER, SILENT_TRIED, endSession, sessionActions } from "./session-actions";

export type State =
  | { kind: "loading" }
  | { kind: "signedOut"; hint?: string; error?: string | undefined }
  /** Signed in at the sign-in service, but registration needs an invitation code (US-ACC-05). */
  | { kind: "invitationNeeded"; error?: string | undefined }
  | { kind: "signedIn"; account: Account; error?: string | undefined }
  | { kind: "error"; text: string };

const env = import.meta.env as Record<string, string | undefined>;

// Once per tab, never after an explicit sign-out and never while the address still carries a result of the detour.
function shouldTrySilently(): boolean {
  const q = new URLSearchParams(window.location.search);
  if (q.has("code") || q.has("error")) return false;
  return !window.sessionStorage.getItem(MARKER) && !window.sessionStorage.getItem(SILENT_TRIED);
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
    window.sessionStorage.removeItem(REGISTER); // a failed end of the registration leaves no flag behind
    if (e instanceof Error && e.message === "not_signed_in") {
      await mgr.removeUser();
      return { kind: "signedOut" };
    }
    if (e instanceof Error && e.message === "invitation_required")
      return { kind: "invitationNeeded" };
    return { kind: "error", text: "Das Konto konnte nicht geladen werden." };
  }
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
