// The two returns of the sign-in service that take the account to another step (US-ACC-01): the return of "Konto anlegen" and of
// "Konto wechseln". Kept apart from the session hook so each module stays within its size.
import type { UserManager, User } from "oidc-client-ts";
import { here, hereState } from "../api/sign-in-client";
import { texts } from "../../shared/lib/text-rules/texts";
import table from "../views/views.de.json";
import { LIVE, MARKER, REGISTER, endSession } from "./session-actions";
import type { State } from "./session";

const t = texts(table);

// The welcome page of a visitor without a sign-in (US-ACC-01, US-QS-32). The hint names a real sign-out only (MARKER); the
// switch shows while this tab knows of a live session and no sign-out happened. A field that does not apply is left out.
export function signedOutState(error?: string): State {
  const signedOut = window.sessionStorage.getItem(MARKER);
  const live = window.sessionStorage.getItem(LIVE) && !signedOut;
  return {
    kind: "signedOut",
    ...(signedOut ? { hint: "Du bist abgemeldet." } : {}),
    ...(error ? { error } : {}),
    ...(live ? { canSwitch: true } : {}),
  };
}

// The return of "Konto anlegen" (US-ACC-01), null if not about it: a live session ends first (id token: no logout page).
export async function registerReturn(
  mgr: UserManager,
  intent: string | null,
  user: User | undefined,
  answered: boolean,
): Promise<State | null> {
  if (intent === "check" && answered) {
    if (user)
      await endSession(mgr, "after_logout").catch((e: unknown) => {
        window.sessionStorage.removeItem(REGISTER); // the session did not end: no flag stays behind
        throw e;
      });
    else await mgr.signinRedirect({ prompt: "create" });
    return { kind: "loading" };
  }
  if (intent === "after_logout" && !user) {
    await mgr.signinRedirect({ prompt: "create" });
    return { kind: "loading" };
  }
  return null;
}

// The return of "Konto wechseln" (US-ACC-01), null if not about it: its session has ended, so the sign-in form opens for the
// other account at once (owner decision 2026-11-14). A redirect that cannot start shows the welcome page with its error (P-10).
export async function switchReturn(
  mgr: UserManager,
  intent: string | null,
  user: User | undefined,
): Promise<State | null> {
  if (intent !== "after_switch" || user) return null;
  try {
    await mgr.signinRedirect({ prompt: "login", redirect_uri: here(), state: hereState() });
    return { kind: "loading" };
  } catch {
    return signedOutState(t("signIn.failed"));
  }
}
