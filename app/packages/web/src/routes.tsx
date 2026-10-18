import { Navigate, Route, Routes, useLocation, useParams } from "react-router";
import type { Species, Specimen } from "@pflanzendex/core";
import { useSession, type State } from "./account";
import { AchievementNewsBanner } from "@/components/routing/areas/shared/lazy-news-banner/lazy-news-banner";
import { CareProfileSection } from "./collection";
import { loadSpecies, searchSpecies, SpeciesPage } from "./catalog";
import type { WishToPlant } from "./wishlist";
import type { ComponentProps } from "react";
import { FunctionOverview, StartPage, UnlockPage, isShownLocked, useUnlocks } from "./shell";
import { AreaSection } from "@/components/routing/areas/shared/area-section/area-section";
import { RouteBoundary } from "@/components/routing/route-boundary/route-boundary";
import {
  AccountArea,
  CollectionArea,
  DiscoverArea,
  TodayArea,
} from "@/components/routing/areas/shared/lazy-areas";
import {
  simpleRoutes,
  socialRoutes,
} from "@/components/routing/areas/shared/simple-routes/simple-routes";
import { legacyRoutes } from "@/components/routing/legacy-routes/legacy-routes";
import {
  PATHS,
  PROFILE_BASE,
  type LinkTarget,
  type View,
} from "./components/shared/navigation/nav-model/navigation/navigation";
/** The start page finds species through the catalog without importing it (ADR 0003). */
const SPECIES_LOOKUP = { search: searchSpecies, load: loadSpecies };
function Start(props: Omit<ComponentProps<typeof StartPage>, "lookup">) {
  return <StartPage lookup={SPECIES_LOOKUP} {...props} />;
}
type Token = () => Promise<string | undefined>;
type SignedIn = Extract<State, { kind: "signedIn" }>["account"];
/** My care profile is a section of the species profile (US-BES-09, US-QS-14); the app wires `collection` into `catalog`. */
const careProfile = (api: string, token: Token) =>
  function CareProfile(species: Species) {
    return (
      <AreaSection
        anchor="pflegeprofil"
        title="Mein Pflegeprofil"
        loading="Pflegeprofil wird geladen …"
      >
        <CareProfileSection api={api} token={token} speciesId={species.id} />
      </AreaSection>
    );
  };

/** The species profile has its own address; the id comes from it (US-POK-09). */
function SpeciesProfileRoute(props: { api: string; token: Token; onChoose: (s: Species) => void }) {
  const { profileId } = useParams();
  return (
    <SpeciesPage
      {...props}
      openId={profileId ?? null}
      profileSection={careProfile(props.api, props.token)}
    />
  );
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
          onCreateSpecimen={h.startFromWish}
        />
      }
    />,
    <Route
      key="discover"
      path={PATHS.discover}
      element={
        <DiscoverArea
          api={api}
          token={token}
          onChoose={h.choose}
          profileSection={careProfile(api, token)}
          {...(h.searchStart ? { searchStart: h.searchStart } : {})}
        />
      }
    />,
    <Route
      key="profile"
      path={`${PROFILE_BASE}/:profileId`}
      element={<SpeciesProfileRoute api={api} token={token} onChoose={h.choose} />}
    />,
  ];
}

/** A function that is not open yet shows its lock page at its own address, never a blank page (US-ONB-05, FR-ONB-02). */
function useLockPages(api: string, token: Token) {
  const locked = new Set(
    useUnlocks()
      .entries.filter(isShownLocked)
      .map((e) => e.id),
  );
  return (id: string) =>
    locked.has(id) ? <UnlockPage api={api} token={token} id={id} /> : undefined;
}

/** What the account may open: the role-bound views and, while "social" is on, "Freunde" (US-DEV-06). */
const rolesOf = (account: SignedIn): Partial<Record<View, boolean>> => ({
  review: account.reviewer === true,
  operator: account.operator === true,
  friends: account.features?.social !== false,
});

/** "Freunde" and the exchange have routes only while "social" is on for the account (US-DEV-06); otherwise the address leads to the start page without a hint. */
export function AppRoutes(props: {
  api: string;
  session: ReturnType<typeof useSession>;
  account: SignedIn;
  error?: string;
  onOpen: (v: LinkTarget) => void;
  onOpenProfile: (id: string) => void;
  handOver: HandOver;
}) {
  const { api, session: s, account, handOver: h } = props;
  const roles = rolesOf(account);
  const social = roles.friends !== false;
  const { pathname } = useLocation();
  const lockPageOf = useLockPages(api, s.token);
  return (
    <RouteBoundary resetKey={pathname}>
      <AchievementNewsBanner api={api} token={s.token} />
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
              overview={<FunctionOverview api={api} token={s.token} />}
              {...(props.error ? { error: props.error } : {})}
            />
          }
        />
        <Route
          path={PATHS.start}
          element={<Start api={api} token={s.token} accountId={account.id} onOpen={props.onOpen} />}
        />
        <Route path="/unlock/:id" element={<UnlockPage api={api} token={s.token} />} />
        {social && socialRoutes(api, s.token, lockPageOf)}
        <Route
          path={PATHS.today}
          element={<TodayArea api={api} token={s.token} onOpen={props.onOpen} />}
        />
        {legacyRoutes()}
        {simpleRoutes(
          api,
          s.token,
          roles,
          lockPageOf("friends")
            ? { friends: <UnlockPage api={api} token={s.token} id="friends" /> }
            : {},
        )}
        {handOverRoutes(api, s.token, h, props.onOpenProfile)}
        <Route path="*" element={<Navigate to={PATHS.start} replace />} />
      </Routes>
    </RouteBoundary>
  );
}
