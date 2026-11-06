import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Species } from "@pflanzendex/core";
import {
  AppError,
  Loading,
  Welcome,
  apiUrl,
  useSession,
  InvitationPage,
  type State,
} from "../../../account";
import { useClearOnSignOut, useFeature } from "../../../shared/data";
import { RouteBoundary } from "@/shared/platform/routing/route-boundary/route-boundary";
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
import { AppShell } from "../app-shell/app-shell";
import {
  pageTitle,
  navItems,
  profileAddress,
  viewAddress,
  viewTitle,
  type LinkTarget,
} from "../../../shared/patterns/navigation/navigation/navigation";
import { PathNotes } from "../../../wishlist";
import { useWishHandOver } from "../../flows/add-plant/wish-to-specimen";
import { UnlocksProvider, isShownLocked, lockMark, useUnlocks } from "../../flows/unlock";
import { SignedInFeatures } from "../../flows/unlock/model/keeper-switches/keeper-switches";

/** The route table is its own chunk: the sign-in screens do not carry it (DS-08, US-QS-14). */
const loadRoutes = () => import("../../routes").then((m) => ({ default: m.AppRoutes }));
const AppRoutes = lazyPage(loadRoutes);

/** The code of "Heute", the landing page; `App` asks for it early, the route still loads it on its own (DS-08). */
const loadToday = () => import("@/app/destinations/today-area/today-area");

const api = apiUrl(import.meta.env as Record<string, string | undefined>);

/** The active view comes from the address; going to a view is a navigation, so back and deep links work (US-QS-07). */
function useViews() {
  const navigate = useNavigate();
  const setView = (next: LinkTarget) => void navigate(viewAddress(next));
  // The Pokédex links to a species profile, so the app wires pokedex and catalog (US-POK-09).
  const openProfile = (id: string) => void navigate(profileAddress(id));
  return { setView, openProfile };
}

/** The chosen species travels from the catalog to the collection: the app wires both modules (US-BES-02). */
function useSpeciesHandOver(setView: (v: LinkTarget) => void) {
  const [newSpecies, setNewSpecies] = useState<Species | null>(null);
  const choose = (species: Species) => {
    setNewSpecies(species);
    setView("collection");
  };
  const toTheCatalog = () => {
    setNewSpecies(null);
    setView("species");
  };
  const toAddPlant = () => {
    setNewSpecies(null);
    setView("addPlant");
  };
  return { newSpecies, setNewSpecies, choose, toTheCatalog, toAddPlant };
}

type Session = ReturnType<typeof useSession>;
type SignedInAccount = Extract<State, { kind: "signedIn" }>["account"];
type SignedOut = Extract<State, { kind: "signedOut" }>;

/** The shell with its navigation; a destination that is not open yet stays in place, marked with text (US-ONB-05). */
function SignedInShell({ account, children }: { account: SignedInAccount; children: ReactNode }) {
  const friends = useUnlocks().entries.find((e) => e.id === "friends");
  const social = useFeature("social");
  return (
    <AppShell
      titleOf={viewTitle}
      shortcutMode={account.keyboardShortcuts}
      items={navItems({
        reviewer: account.reviewer === true,
        operator: account.operator === true,
        social,
        locks: friends && isShownLocked(friends) ? { friends: lockMark(friends) } : {},
      })}
    >
      {children}
    </AppShell>
  );
}

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
  const { setView, openProfile } = useViews();
  const { state: navState } = useLocation() as { state: { hint?: string } | null };
  const handOver = useSpeciesHandOver(setView);
  // The way from a bought wish to its specimen (US-WUN-05): wishlist, catalog and collection are wired here.
  const wishPath = useWishHandOver(api, s.token, handOver);
  const z = s.state;
  const { pathname } = useLocation();
  // Fetch the route table while the session loads; a failure shows at the routes, with "Erneut versuchen" (P-10).
  useEffect(() => void loadRoutes().catch(() => undefined), []);
  // Heute is the landing page: once the account is known its code is fetched in parallel with the routes (NFR-12).
  const signedIn = z.kind === "signedIn";
  useEffect(() => {
    if (signedIn) void loadToday().catch(() => undefined);
  }, [signedIn]);
  useClearOnSignOut(z.kind === "signedIn");
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
    <UnlocksProvider api={api} token={s.token}>
      <SignedInFeatures features={z.account.features}>
        <SignedInShell account={z.account}>
          {/* The width cap of the page is lifted for a destination with layers: its frame takes the main column and caps only its content, so a pane fits beside it (US-QS-15, #1027). */}
          <div className="mx-auto w-full max-w-180 has-[[data-layer-host]]:max-w-none">
            <div className="mx-auto w-full max-w-180">
              {navState?.hint && (
                <p role="alert" className="mb-3 rounded-lg border border-border p-3">
                  {navState.hint}
                </p>
              )}
              {(wishPath.notes.wish || wishPath.notes.notice) && (
                <Suspense fallback={null}>
                  <PathNotes {...wishPath.notes} />
                </Suspense>
              )}
            </div>
            <RouteBoundary resetKey={pathname}>
              <AppRoutes
                api={api}
                session={s}
                account={z.account}
                {...(z.error ? { error: z.error } : {})}
                onOpen={setView}
                onOpenProfile={openProfile}
                handOver={wishPath.handOver}
              />
            </RouteBoundary>
          </div>
        </SignedInShell>
      </SignedInFeatures>
    </UnlocksProvider>
  );
}
