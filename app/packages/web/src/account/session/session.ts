import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserManager } from "oidc-client-ts";
import { setProfileTimeZone } from "../../shared/data";
import { apiUrl, getAccount, type Account } from "../api/account-api";
import { here, hereState, newManager, processReturn } from "../api/sign-in-client";
import { failureOf } from "./session-failure";
import { registerReturn, signedOutState, switchReturn } from "./session-returns";
import { texts } from "../../shared/lib/text-rules/texts";
import table from "../views/views.de.json";
import { LIVE, REGISTER, SILENT_TRIED, sessionActions, shouldTrySilently } from "./session-actions";

export type State =
  | { kind: "loading" }
  /** canSwitch: this tab knows of a live session at the sign-in service, so "Konto wechseln" shows (US-QS-32). */
  | { kind: "signedOut"; hint?: string; error?: string | undefined; canSwitch?: boolean }
  /** Signed in at the sign-in service, but registration needs an invitation code (US-ACC-05). */
  | { kind: "invitationNeeded"; error?: string | undefined }
  /** `everywhereBusy`: "Auf allen Geräten abmelden" runs; its control shows busy and a second press does nothing (US-ACC-01).
   * `everywhereError`: its failure, with the retry that repeats it (US-QS-32). */
  | {
      kind: "signedIn";
      account: Account;
      error?: string | undefined;
      everywhereError?: string | undefined;
      everywhereBusy?: boolean;
    }
  /** `code` and `text` of a failed account load (US-QS-32); reloadPage: the sign-in library did not load (US-ACC-01). */
  | { kind: "error"; text: string; reloadPage?: boolean; code?: string };

const env = import.meta.env as Record<string, string | undefined>;
const t = texts(table);

// The error answers of a sign-in return that say the sign-in service holds a session for this browser, but needs an
// interaction first (US-QS-32). `login_required` says there is none and is not among them.
const LIVE_ERRORS = ["interaction_required", "consent_required", "account_selection_required"];

// The one silent attempt of the tab (US-ACC-01). The redirect leaves the page, so the state stays loading; when the
// sign-in service cannot be reached, the welcome page says so. The attempt stays used up (SILENT_TRIED), so no retry follows.
async function silentAttempt(mgr: UserManager): Promise<State> {
  try {
    // The check returns to this address, so a scanned label survives the refused check (US-BES-17, #1619), with its query (#1639).
    await mgr.signinRedirect({ prompt: "none", redirect_uri: here(), state: hereState() });
    return { kind: "loading" };
  } catch {
    return signedOutState(t("signIn.unreachable"));
  }
}

async function loadState(mgr: UserManager, retrying: boolean): Promise<State> {
  try {
    // Read and cleared at once: Strict Mode runs the load twice, and only the first run acts on the intent.
    const intent = window.sessionStorage.getItem(REGISTER);
    window.sessionStorage.removeItem(REGISTER);
    const q = new URLSearchParams(window.location.search); // read before processReturn cleans the address
    const answered = q.has("code") || q.has("error");
    // The sign-in service holds a session that needs an interaction first: this tab knows of it (US-QS-32).
    // `login_required` says it holds none, so a flag left by an earlier sign-in in this tab goes (US-QS-32).
    const error = q.get("error") ?? "";
    if (LIVE_ERRORS.includes(error)) window.sessionStorage.setItem(LIVE, "1");
    else if (error === "login_required") window.sessionStorage.removeItem(LIVE);
    const user = await processReturn(mgr);
    const registering = await registerReturn(mgr, intent, user, answered);
    if (registering) return registering;
    const switching = await switchReturn(mgr, intent, user);
    if (switching) return switching;
    if (!user) {
      if (shouldTrySilently()) {
        // A live session at the sign-in service (app token lost, other port, cleared site data) is picked up
        // without showing a login page (US-ACC-01); without one the service answers `login_required` at once.
        window.sessionStorage.setItem(SILENT_TRIED, "1");
        return silentAttempt(mgr);
      }
      return signedOutState();
    }
    // The sign-in service handed out a token, so its session lives and this tab knows of it (US-QS-32).
    window.sessionStorage.setItem(LIVE, "1");
    const account = await getAccount(apiUrl(env), user.access_token);
    // Phases, due dates and "today" are computed in the time zone of the profile (NFR-08, US-ACC-02).
    setProfileTimeZone(account.timeZone ?? null);
    return { kind: "signedIn", account };
  } catch (e) {
    if (e instanceof Error && e.message === "not_signed_in") {
      await mgr.removeUser();
      return signedOutState();
    }
    if (e instanceof Error && e.message === "invitation_required")
      return { kind: "invitationNeeded" };
    return { kind: "error", ...failureOf(e, retrying) };
  }
}

export function useSession() {
  const manager = useMemo(newManager, []);
  const [state, setState] = useState<State>({ kind: "loading" });
  const failed = useRef(false); // the last load failed: a retry that fails again says so (US-QS-32)

  const load = useCallback(async () => {
    const retrying = failed.current;
    setState({ kind: "loading" });
    let mgr: UserManager;
    try {
      mgr = await manager;
    } catch {
      // The sign-in library did not load (a failed chunk): load is the one place that tells the person (US-ACC-01).
      setState({ kind: "error", text: t("library.failed"), reloadPage: true });
      return;
    }
    const next = await loadState(mgr, retrying);
    failed.current = next.kind === "error";
    setState(next);
  }, [manager]);

  useEffect(() => {
    void load();
    const ended = () => {
      // The session ended at the sign-in service, so this tab no longer knows of a live one (US-QS-32).
      window.sessionStorage.removeItem(LIVE);
      setState({
        kind: "signedOut",
        hint: "Deine Sitzung wurde beendet. Bitte melde dich neu an.",
      });
    };
    // A failed library rejects the manager: load tells the person about it, so the listeners do not attach here, and the
    // rejection is handled instead of left unhandled.
    const listening = manager.then(
      (mgr) => {
        mgr.events.addUserSignedOut(ended);
        mgr.events.addSilentRenewError(ended);
        return mgr;
      },
      () => null,
    );
    return () => {
      void listening.then((mgr) => {
        if (!mgr) return;
        mgr.events.removeUserSignedOut(ended);
        mgr.events.removeSilentRenewError(ended);
      });
    };
  }, [manager, load]);

  const token = useCallback(async () => (await (await manager).getUser())?.access_token, [manager]);
  const actions = useMemo(() => sessionActions(manager, setState, apiUrl(env)), [manager]);

  return { state, token, reload: load, ...actions };
}
