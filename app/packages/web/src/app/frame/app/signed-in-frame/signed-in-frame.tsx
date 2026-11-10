import { Suspense, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Species } from "@pflanzendex/core";
import { apiUrl, type State, type useSession } from "@/account";
import { useFeature } from "@/shared/data";
import {
  ChunkErrorBoundary,
  RouteBoundary,
} from "@/shared/platform/routing/route-boundary/route-boundary";
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
import { AppShell } from "@/app/frame/app-shell/app-shell";
import {
  navItems,
  profileAddress,
  viewAddress,
  viewTitle,
  type LinkTarget,
} from "@/shared/patterns/navigation/navigation/navigation";
import { PathNotes } from "@/wishlist";
import { useWishHandOver } from "@/app/flows/add-plant/wish-to-specimen";
import { UnlocksProvider, isShownLocked, lockMark, useUnlocks } from "@/app/flows/unlock";
import { SignedInFeatures } from "@/app/flows/unlock/model/keeper-switches/keeper-switches";

/** The route table is its own chunk: the sign-in screens do not carry it (DS-08, US-QS-14). */
const AppRoutes = lazyPage(() => import("@/app/routes").then((m) => ({ default: m.AppRoutes })));

/** The number of the app icon (US-QS-29): its own chunk, mounted once for the signed-in shell; it draws nothing. */
const AppBadge = lazyPage(() =>
  import("./app-badge/app-badge").then((m) => ({ default: m.AppBadge })),
);

const api = apiUrl(import.meta.env as Record<string, string | undefined>);

type Session = ReturnType<typeof useSession>;
type SignedInAccount = Extract<State, { kind: "signedIn" }>["account"];

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

/** The unlock function behind "Freunde" in the core registry: its lock mark is the one the navigation shows (US-ONB-05). */
const FRIENDS_UNLOCK = "friends";

/** The shell with its navigation; a destination that is not open yet stays in place, marked with text (US-ONB-05). */
function SignedInShell({ account, children }: { account: SignedInAccount; children: ReactNode }) {
  const friends = useUnlocks().entries.find((e) => e.id === FRIENDS_UNLOCK);
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

/**
 * The signed-in frame: the shell, its keyboard shortcuts, the unlocks and the page routes. Its code is its own chunk
 * (issue 1728): the sign-in page is the first paint for a signed-out visitor, and it does not carry any of this.
 */
export function SignedInFrame({
  session: s,
  account,
  error,
}: {
  session: Session;
  account: SignedInAccount;
  error?: string;
}) {
  const { setView, openProfile } = useViews();
  const { state: navState } = useLocation() as { state: { hint?: string } | null };
  const handOver = useSpeciesHandOver(setView);
  // The way from a bought wish to its specimen (US-WUN-05): wishlist, catalog and collection are wired here.
  const wishPath = useWishHandOver(api, s.token, handOver);
  const { pathname } = useLocation();
  return (
    <UnlocksProvider api={api} token={s.token}>
      <SignedInFeatures features={account.features}>
        {/* The icon is not essential: a failure of its chunk or its render shows nothing and is logged (P-10), it never ends the shell. */}
        <ChunkErrorBoundary resetKey="app-badge" errorView={() => null}>
          <Suspense fallback={null}>
            <AppBadge api={api} token={s.token} />
          </Suspense>
        </ChunkErrorBoundary>
        <SignedInShell account={account}>
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
                account={account}
                {...(error ? { error } : {})}
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
