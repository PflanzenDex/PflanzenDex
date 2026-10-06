import type { ComponentType } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router";
import type { Species } from "@pflanzendex/core";
import { CollectionArea } from "./collection-area";
import { CareProfilePage, DifficultyPage, HintsPage } from "./collection";
import { AccountView, SettingsPage, OperatorPage, useSession, type State } from "./account";
import { LightPage } from "./light";
import { ReviewPage, SpeciesPage } from "./catalog";
import { CarePhasesPage, TreatmentsPage } from "./care";
import { PokedexPage } from "./pokedex";
import { WishlistPage } from "./wishlist";
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
import { RouteBoundary } from "@/components/routing/route-boundary/route-boundary";
import { PATHS, type View } from "./navigation";

/** The start page carries the onboarding forms (validation, form library): its chunk loads with its route (#451). */
const StartPage = lazyPage(() => import("./start-page").then((m) => ({ default: m.StartPage })));

type Token = () => Promise<string | undefined>;
type SignedIn = Extract<State, { kind: "signedIn" }>["account"];

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

/** The species profile has its own address; the id comes from it (US-POK-09). */
function SpeciesProfileRoute(props: { api: string; token: Token; onChoose: (s: Species) => void }) {
  const { profileId } = useParams();
  return <SpeciesPage {...props} openId={profileId ?? null} />;
}

/** Shown on the start page when a role-bound address is opened without the role (P-10). */
const NO_ACCESS: Partial<Record<View, string>> = {
  review: "Die Prüfliste ist nur für Prüfende und den Betreiber sichtbar.",
  operator: "Der Betreiberbereich ist nur für den Betreiber sichtbar.",
};

/** One route per page that needs only the API address and the token; role-bound ones redirect without the role (P-10). */
function simpleRoutes(api: string, token: Token, roles: Partial<Record<View, boolean>>) {
  return (Object.keys(SIMPLE_VIEWS) as View[]).map((v) => {
    const Simple = SIMPLE_VIEWS[v];
    return Simple ? (
      <Route
        key={v}
        path={PATHS[v]}
        element={
          roles[v] === false ? (
            <Navigate to={PATHS.start} replace state={{ hint: NO_ACCESS[v] }} />
          ) : (
            <Simple api={api} token={token} />
          )
        }
      />
    ) : null;
  });
}

type HandOver = {
  newSpecies: Species | null;
  setNewSpecies: (s: Species | null) => void;
  choose: (s: Species) => void;
  toTheCatalog: () => void;
};

/** The catalog and the collection hand the chosen species over to each other (US-BES-02). */
function handOverRoutes(api: string, token: Token, h: HandOver) {
  return [
    <Route
      key="collection"
      path={PATHS.collection}
      element={
        <CollectionArea
          api={api}
          token={token}
          newSpecies={h.newSpecies}
          onSpeciesChoose={h.toTheCatalog}
          onCompleted={() => h.setNewSpecies(null)}
        />
      }
    />,
    <Route
      key="species"
      path={PATHS.species}
      element={<SpeciesPage api={api} token={token} onChoose={h.choose} openId={null} />}
    />,
    <Route
      key="profile"
      path={`${PATHS.species}/:profileId`}
      element={<SpeciesProfileRoute api={api} token={token} onChoose={h.choose} />}
    />,
  ];
}

export function AppRoutes(props: {
  api: string;
  session: ReturnType<typeof useSession>;
  account: SignedIn;
  error?: string;
  onOpen: (v: View) => void;
  onOpenProfile: (id: string) => void;
  handOver: {
    newSpecies: Species | null;
    setNewSpecies: (s: Species | null) => void;
    choose: (s: Species) => void;
    toTheCatalog: () => void;
  };
}) {
  const { api, session: s, account, handOver: h } = props;
  const roles: Partial<Record<View, boolean>> = {
    review: account.reviewer === true,
    operator: account.operator === true,
  };
  const { pathname } = useLocation();
  return (
    <RouteBoundary resetKey={pathname}>
      <Routes>
        <Route
          path={PATHS.account}
          element={
            <AccountView
              account={account}
              onSignOut={s.signOut}
              onEverywhereSignOut={() => void s.everywhereSignOut()}
              {...(props.error ? { error: props.error } : {})}
            />
          }
        />
        {(["start", "light", "hints"] as const).map((v) => (
          <Route
            key={v}
            path={PATHS[v]}
            element={
              <LinkingView
                view={v}
                api={api}
                token={s.token}
                accountId={account.id}
                onOpen={props.onOpen}
              />
            }
          />
        ))}
        <Route
          path={PATHS.pokedex}
          element={<PokedexPage api={api} token={s.token} onOpenSpecies={props.onOpenProfile} />}
        />
        {simpleRoutes(api, s.token, roles)}
        {handOverRoutes(api, s.token, h)}
        <Route path="*" element={<Navigate to={PATHS.start} replace />} />
      </Routes>
    </RouteBoundary>
  );
}
