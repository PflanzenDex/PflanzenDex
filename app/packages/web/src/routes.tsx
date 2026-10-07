import type { ComponentType } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router";
import type { Species, Specimen } from "@pflanzendex/core";
import { CollectionArea } from "./collection-area";
import { CareProfilePage, DifficultyPage } from "./collection";
import { OperatorPage, useSession, type State } from "./account";
import { LightPage } from "./light";
import { ReviewPage, SpeciesPage } from "./catalog";
import { CarePhasesPage } from "./care";
import { FriendsPage } from "./social";
import { DiscoverPage } from "./discover";
import { WishlistPage, type WishToPlant } from "./wishlist";
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
import { RouteBoundary } from "@/components/routing/route-boundary/route-boundary";
import { AccountArea, TodayArea } from "@/components/routing/areas/lazy-areas";
import { legacyRoutes } from "@/components/routing/legacy-routes/legacy-routes";
import { PATHS, type View } from "./navigation";
/** The start page carries the onboarding forms: its chunk loads with its route (#451). */
const StartPage = lazyPage(() => import("./start-page").then((m) => ({ default: m.StartPage })));
type Token = () => Promise<string | undefined>;
type SignedIn = Extract<State, { kind: "signedIn" }>["account"];
/** The views that need nothing but the API address and the token. */
const SIMPLE_VIEWS: Partial<Record<View, ComponentType<{ api: string; token: Token }>>> = {
  carePhases: CarePhasesPage,
  careProfile: CareProfilePage,
  difficulty: DifficultyPage,
  friends: FriendsPage,
  discover: DiscoverPage,
  review: ReviewPage,
  operator: OperatorPage,
};

/** The views that link on to other views; the app wires them (ADR 0003). */
function LinkingView(props: {
  view: "start" | "light";
  api: string;
  token: Token;
  accountId: string;
  onOpen: (v: View) => void;
}) {
  const { api, token, onOpen } = props;
  if (props.view === "start")
    return <StartPage api={api} token={token} accountId={props.accountId} onOpen={onOpen} />;
  return <LightPage api={api} token={token} onOpenCollection={() => onOpen("collection")} />;
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
  /** A specimen was created for the chosen species: the app links it to its bought wish, if any (US-WUN-05). */
  onCreated: (specimen: Specimen) => void;
  /** Starts the way from a bought wish to its specimen (US-WUN-05). */
  startFromWish: (wish: WishToPlant) => void;
  /** The catalog search starts with this text while a bought wish is on its way to the specimen (US-WUN-05). */
  searchStart?: string;
};

/** The catalog and the collection hand the chosen species over to each other (US-BES-02); the wishlist starts the way to the plant (US-WUN-05). */
function handOverRoutes(api: string, token: Token, h: HandOver, open: (id: string) => void) {
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
          onCompleted={h.onCreated}
          onOpenSpecies={open}
        />
      }
    />,
    <Route
      key="species"
      path={PATHS.species}
      element={
        <SpeciesPage
          api={api}
          token={token}
          onChoose={h.choose}
          openId={null}
          {...(h.searchStart ? { initialSearch: h.searchStart } : {})}
        />
      }
    />,
    <Route
      key="wishlist"
      path={PATHS.wishlist}
      element={<WishlistPage api={api} token={token} onCreateSpecimen={h.startFromWish} />}
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
  handOver: HandOver;
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
            <AccountArea
              api={api}
              token={s.token}
              account={account}
              onSignOut={s.signOut}
              onEverywhereSignOut={() => void s.everywhereSignOut()}
              {...(props.error ? { error: props.error } : {})}
            />
          }
        />
        {(["start", "light"] as const).map((v) => (
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
          path={PATHS.today}
          element={<TodayArea api={api} token={s.token} onOpen={props.onOpen} />}
        />
        {legacyRoutes()}
        {simpleRoutes(api, s.token, roles)}
        {handOverRoutes(api, s.token, h, props.onOpenProfile)}
        <Route path="*" element={<Navigate to={PATHS.start} replace />} />
      </Routes>
    </RouteBoundary>
  );
}
