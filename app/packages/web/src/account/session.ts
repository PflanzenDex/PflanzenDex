import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { UserManager, User } from "oidc-client-ts";
import { setProfileTimeZone } from "../kernel";
import {
  signOutEverywhere,
  apiUrl,
  getAccount,
  oidcSettings,
  type Account,
} from "./api/account-api";

export type State =
  | { kind: "loading" }
  | { kind: "signedOut"; hint?: string }
  /** Signed in at the sign-in service, but registration needs an invitation code (US-ACC-05). */
  | { kind: "invitationNeeded" }
  | { kind: "signedIn"; account: Account; error?: string }
  | { kind: "error"; text: string };

const env = import.meta.env as Record<string, string | undefined>;
const MARKER = "pflanzendex.signed_out";

// The sign-in library is about a seventh of the initial JavaScript; it loads as its own chunk, started at once
// (the loading state paints meanwhile) instead of travelling inside the entry chunk (US-QS-07, DS-08).
const library = import("oidc-client-ts");

async function newManager(): Promise<UserManager> {
  const { UserManager: Manager, WebStorageStateStore } = await library;
  return new Manager({
    ...oidcSettings(env, window.location.origin),
    // The sign-in stays on the device (US-ACC-01); revocable via "sign out on all devices".
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
}

// The redirect back from the sign-in service may be processed only once (React Strict Mode calls effects twice).
let callback: Promise<User | undefined> | null = null;
function processReturn(mgr: UserManager): Promise<User | undefined> {
  const q = new URLSearchParams(window.location.search);
  if (q.has("code") && q.has("state")) {
    callback ??= mgr.signinCallback().then((u) => u ?? undefined);
    return callback.finally(() => window.history.replaceState({}, "", window.location.pathname));
  }
  if (q.has("error")) window.history.replaceState({}, "", window.location.pathname);
  return mgr.getUser().then((u) => (u && !u.expired ? u : undefined));
}

async function loadState(mgr: UserManager): Promise<State> {
  try {
    const user = await processReturn(mgr);
    if (!user) {
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

function sessionActions(manager: Promise<UserManager>, setState: Dispatch<SetStateAction<State>>) {
  return {
    signIn: () => {
      window.sessionStorage.removeItem(MARKER);
      void manager.then((mgr) => mgr.signinRedirect());
    },
    // `prompt=create` opens registration directly at the sign-in service (OIDC extension, supported by Keycloak).
    register: () => {
      window.sessionStorage.removeItem(MARKER);
      void manager.then((mgr) => mgr.signinRedirect({ prompt: "create" }));
    },
    signOut: () => {
      window.sessionStorage.setItem(MARKER, "1");
      void manager.then((mgr) => mgr.signoutRedirect());
    },
    everywhereSignOut: async () => {
      const mgr = await manager;
      const user = await mgr.getUser();
      try {
        if (user) await signOutEverywhere(mgr.settings.authority, user.access_token);
        await mgr.removeUser();
        setProfileTimeZone(null);
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
