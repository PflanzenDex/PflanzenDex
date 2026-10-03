import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { signOutEverywhere, apiUrl, getAccount, oidcSettings, type Account } from "./account-api";

export type State =
  | { kind: "loading" }
  | { kind: "signedOut"; hint?: string }
  | { kind: "signedIn"; account: Account; error?: string }
  | { kind: "error"; text: string };

const env = import.meta.env as Record<string, string | undefined>;
const MARKER = "pflanzendex.signed_out";

function newManager(): UserManager {
  return new UserManager({
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
    return { kind: "signedIn", account: await getAccount(apiUrl(env), user.access_token) };
  } catch (e) {
    if (e instanceof Error && e.message === "not_signed_in") {
      await mgr.removeUser();
      return { kind: "signedOut" };
    }
    return { kind: "error", text: "Das Konto konnte nicht geladen werden." };
  }
}

function sessionActions(mgr: UserManager, setState: Dispatch<SetStateAction<State>>) {
  return {
    signIn: () => {
      window.sessionStorage.removeItem(MARKER);
      void mgr.signinRedirect();
    },
    // `prompt=create` opens registration directly at the sign-in service (OIDC extension, supported by Keycloak).
    register: () => {
      window.sessionStorage.removeItem(MARKER);
      void mgr.signinRedirect({ prompt: "create" });
    },
    signOut: () => {
      window.sessionStorage.setItem(MARKER, "1");
      void mgr.signoutRedirect();
    },
    everywhereSignOut: async () => {
      const user = await mgr.getUser();
      try {
        if (user) await signOutEverywhere(mgr.settings.authority, user.access_token);
        await mgr.removeUser();
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
  const mgr = useMemo(newManager, []);
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setState(await loadState(mgr));
  }, [mgr]);

  useEffect(() => {
    void load();
    const ended = () =>
      setState({
        kind: "signedOut",
        hint: "Deine Sitzung wurde beendet. Bitte melde dich neu an.",
      });
    mgr.events.addUserSignedOut(ended);
    mgr.events.addSilentRenewError(ended);
    return () => {
      mgr.events.removeUserSignedOut(ended);
      mgr.events.removeSilentRenewError(ended);
    };
  }, [mgr, load]);

  const token = useCallback(async () => (await mgr.getUser())?.access_token, [mgr]);
  const actions = useMemo(() => sessionActions(mgr, setState), [mgr]);

  return { state, token, reload: load, ...actions };
}
