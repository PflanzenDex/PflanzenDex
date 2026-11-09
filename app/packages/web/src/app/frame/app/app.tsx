import { useEffect } from "react";
import {
  AppError,
  Loading,
  Welcome,
  apiUrl,
  useSession,
  InvitationPage,
  type State,
} from "../../../account";
import { useClearOnSignOut } from "../../../shared/data";
import { RouteBoundary } from "@/shared/platform/routing/route-boundary/route-boundary";
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
import { pageTitle } from "../../../shared/patterns/navigation/navigation/navigation";

/** The route table is its own chunk: the sign-in screens do not carry it (DS-08, US-QS-14). */
const loadRoutes = () => import("../../routes").then((m) => ({ default: m.AppRoutes }));

/** The code of "Heute", the landing page; `App` asks for it early, the route still loads it on its own (DS-08). */
const loadToday = () => import("@/app/destinations/today-area/today-area");

/**
 * The signed-in frame (the shell, its shortcuts, the unlocks and the routes) is its own chunk (issue 1728): the sign-in
 * page is the first paint of a signed-out visitor and must not wait for the shell's modules to download.
 */
const SignedInFrame = lazyPage(() =>
  import("./signed-in-frame/signed-in-frame").then((m) => ({ default: m.SignedInFrame })),
);

const api = apiUrl(import.meta.env as Record<string, string | undefined>);

type Session = ReturnType<typeof useSession>;
type SignedOut = Extract<State, { kind: "signedOut" }>;

/** The page title before there is an account to work with (US-QS-09, WCAG 2.4.2); signed in, the shell sets it per view. */
const ENTRY_TITLES: Record<Exclude<State["kind"], "signedIn">, string | undefined> = {
  loading: undefined,
  error: "Fehler",
  signedOut: "Anmelden",
  invitationNeeded: "Einladungscode",
};

function useEntryTitle(kind: State["kind"]) {
  useEffect(() => {
    if (kind !== "signedIn") document.title = pageTitle(ENTRY_TITLES[kind]);
  }, [kind]);
}

/** What shows before there is an account to work with: loading, an error, the invitation code (the welcome page has its own frame). */
function EntryStates({ state: z, session: s }: { state: State; session: Session }) {
  return (
    <>
      {z.kind === "loading" && <Loading />}
      {z.kind === "error" && (
        <AppError text={z.text} reloadPage={z.reloadPage} onReload={() => void s.reload()} />
      )}
      {z.kind === "invitationNeeded" && (
        <RouteBoundary resetKey="invitation">
          <InvitationPage
            api={api}
            token={s.token}
            onRegistered={() => void s.reload()}
            onSignOut={s.signOut}
            {...(z.error ? { error: z.error } : {})}
          />
        </RouteBoundary>
      )}
    </>
  );
}

/** The welcome page with the session's actions: sign in, register, another account (US-ACC-01). */
function SignedOutWelcome({ session: s, state: z }: { session: Session; state: SignedOut }) {
  return (
    <Welcome
      onRegister={s.register}
      onSignIn={s.signIn}
      onAnotherAccount={s.useAnotherAccount}
      hint={z.hint}
      error={z.error}
    />
  );
}

export function App() {
  const s = useSession();
  const z = s.state;
  // A sign-in on this device (its token) fetches the frame and the route table while the account loads, so the page opens
  // without a wait; a failure shows at the routes, with "Erneut versuchen" (P-10). A signed-out visitor fetches neither:
  // their downloads would compete with the sign-in check on the first screen (issue 1728, NFR-12).
  useEffect(() => {
    void s.token().then(
      (token) => {
        if (!token) return;
        void SignedInFrame.load().catch(() => undefined);
        void loadRoutes().catch(() => undefined);
      },
      () => undefined,
    );
  }, [s.token]);
  // Heute is the landing page: once the account is known its code is fetched in parallel with the routes (NFR-12).
  const signedIn = z.kind === "signedIn";
  useEffect(() => {
    if (signedIn) void loadToday().catch(() => undefined);
  }, [signedIn]);
  useClearOnSignOut(signedIn);
  useEntryTitle(z.kind);
  // The welcome page is the sign-in frame of its own (US-QS-14); loading, errors and the invitation keep the padded main.
  if (z.kind === "signedOut") return <SignedOutWelcome session={s} state={z} />;
  if (z.kind !== "signedIn")
    return (
      <main className="flex min-h-dvh flex-col items-center px-4 py-6 md:pt-20">
        <EntryStates state={z} session={s} />
      </main>
    );
  return (
    <RouteBoundary resetKey="signed-in">
      <SignedInFrame session={s} account={z.account} {...(z.error ? { error: z.error } : {})} />
    </RouteBoundary>
  );
}
