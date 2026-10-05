import { useState, type ComponentType } from "react";
import type { Species } from "@pflanzendex/core";
import { CollectionArea } from "./collection-area";
import { CareProfilePage, DifficultyPage, HintsPage } from "./collection";
import {
  AppError,
  AccountView,
  Loading,
  Welcome,
  apiUrl,
  useSession,
  SettingsPage,
  InvitationPage,
  OperatorPage,
  type State,
} from "./account";
import { LightPage } from "./light";
import { ReviewPage, SpeciesPage } from "./catalog";
import { CarePhasesPage, TreatmentsPage } from "./care";
import { PokedexPage } from "./pokedex";
import { WishlistPage } from "./wishlist";
import { StartPage } from "./start-page";
import { Navigation, type View } from "./navigation";
import "./style.css";

const api = apiUrl(import.meta.env as Record<string, string | undefined>);

const version = (import.meta.env as Record<string, string | undefined>)["VITE_APP_VERSION"];

type Token = () => Promise<string | undefined>;
/** The views that need nothing but the API address and the token. */
const SIMPLE_VIEWS: Partial<Record<View, ComponentType<{ api: string; token: Token }>>> = {
  treatments: TreatmentsPage,
  carePhases: CarePhasesPage,
  careProfile: CareProfilePage,
  difficulty: DifficultyPage,
  wishlist: WishlistPage,
  review: ReviewPage,
  operator: OperatorPage,
  settings: SettingsPage,
};

/** The active view; the Pokédex links to a species profile, so the app wires pokedex and catalog (US-POK-09). */
function useViews() {
  const [view, showView] = useState<View>("start");
  const [profileId, setProfileId] = useState<string | null>(null);
  const openProfile = (id: string) => {
    setProfileId(id);
    showView("species");
  };
  // Every other way to a view forgets the profile the Pokédex opened, so the catalog never reopens an old one.
  const setView = (next: View) => {
    setProfileId(null);
    showView(next);
  };
  return { view, setView, profileId, openProfile, switchView: setView };
}

/** The chosen species travels from the catalog to the collection: the app wires both modules (US-BES-02). */
function useSpeciesHandOver(setView: (v: View) => void) {
  const [newSpecies, setNewSpecies] = useState<Species | null>(null);
  const choose = (species: Species) => {
    setNewSpecies(species);
    setView("collection");
  };
  const toTheCatalog = () => {
    setNewSpecies(null);
    setView("species");
  };
  return { newSpecies, setNewSpecies, choose, toTheCatalog };
}

/** The views that only link on to other views (start, light overview, hints); the app wires them (ADR 0003). */
function LinkingView(props: {
  view: "start" | "light" | "hints";
  api: string;
  token: Token;
  accountId: string;
  onOpen: (v: View) => void;
}) {
  const { api, token, onOpen } = props;
  if (props.view === "start")
    return <StartPage api={api} token={token} accountId={props.accountId} onOpen={onOpen} />;
  if (props.view === "light")
    return <LightPage api={api} token={token} onOpenCollection={() => onOpen("collection")} />;
  return <HintsPage api={api} token={token} onOpen={onOpen} />;
}

type Session = ReturnType<typeof useSession>;

/** What shows before there is an account to work with: loading, an error, the welcome page, the invitation code. */
function EntryStates(props: { state: State; session: Session }) {
  const { state: z, session: s } = props;
  return (
    <>
      {z.kind === "loading" && <Loading />}
      {z.kind === "error" && <AppError text={z.text} onReload={() => void s.reload()} />}
      {z.kind === "signedOut" && (
        <Welcome
          onRegister={s.register}
          onSignIn={s.signIn}
          {...(z.hint ? { hint: z.hint } : {})}
        />
      )}
      {z.kind === "invitationNeeded" && (
        <InvitationPage
          api={api}
          token={s.token}
          onRegistered={() => void s.reload()}
          onSignOut={s.signOut}
        />
      )}
    </>
  );
}

export function App() {
  const s = useSession();
  const { view, setView, profileId, openProfile, switchView } = useViews();
  const { newSpecies, setNewSpecies, choose, toTheCatalog } = useSpeciesHandOver(setView);
  const z = s.state;
  const Simple = SIMPLE_VIEWS[view];
  return (
    <main className="page">
      <EntryStates state={z} session={s} />
      {z.kind === "signedIn" && (
        <div className="frame">
          <Navigation
            active={view}
            onSwitch={switchView}
            reviewer={z.account.reviewer === true}
            operator={z.account.operator === true}
          />
          {view === "account" ? (
            <AccountView
              account={z.account}
              onSignOut={s.signOut}
              onEverywhereSignOut={() => void s.everywhereSignOut()}
              {...(z.error ? { error: z.error } : {})}
            />
          ) : view === "start" || view === "light" || view === "hints" ? (
            <LinkingView
              view={view}
              api={api}
              token={s.token}
              accountId={z.account.id}
              onOpen={setView}
            />
          ) : view === "pokedex" ? (
            <PokedexPage api={api} token={s.token} onOpenSpecies={openProfile} />
          ) : Simple ? (
            <Simple api={api} token={s.token} />
          ) : view === "collection" ? (
            <CollectionArea
              api={api}
              token={s.token}
              newSpecies={newSpecies}
              onSpeciesChoose={toTheCatalog}
              onCompleted={() => setNewSpecies(null)}
            />
          ) : (
            <SpeciesPage api={api} token={s.token} onChoose={choose} openId={profileId} />
          )}
        </div>
      )}
      <footer className="version-footer">Version {version || "unbekannt"}</footer>
    </main>
  );
}
