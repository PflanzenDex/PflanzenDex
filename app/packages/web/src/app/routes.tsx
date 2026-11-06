import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { useFeature } from "../shared/data";
import { FriendsNewsLayer, FriendsNewsTile } from "../social";
import {
  handOverRoutes,
  SPECIES_LOOKUP,
  type HandOver,
} from "@/app/destinations/collection-area/hand-over-routes/hand-over-routes";
import { useSession, type State } from "../account";
import { PotLabelPage } from "@/collection";
import { AchievementNewsBanner } from "@/app/destinations/area-parts/lazy-news-banner/lazy-news-banner";
import { LockedLayer, LockedRows, LockedTile } from "./flows/unlock/locked-rows";
import {
  FunctionOverview,
  TodayIntro,
  UnlockPage,
  isShownLocked,
  lockMark,
  useUnlocks,
} from "./flows";
import { RouteBoundary } from "@/shared/platform/routing/route-boundary/route-boundary";
import { AccountArea, TodayArea } from "@/app/destinations/area-parts/lazy-areas";
import type { DrawTile, TodayTile } from "@/app/destinations/today-area/today-area";
import {
  simpleRoutes,
  socialRoutes,
} from "@/app/destinations/area-parts/simple-routes/simple-routes";
import { legacyRoutes } from "@/app/legacy-routes/legacy-routes";
import {
  PATHS,
  destinationHeading,
  type LinkTarget,
  type View,
} from "../shared/patterns/navigation/navigation/navigation";
/** The one-time hint of "Heute" after an update (US-DEV-06): a lazy part, so its lines load beside "Heute", not with the shell. */
const WhatsNewHint = lazy(() =>
  import("@/app/destinations/account-area/whats-new/whats-new-hint/whats-new-hint").then((m) => ({
    default: m.WhatsNewHint,
  })),
);
type Token = () => Promise<string | undefined>;
type SignedIn = Extract<State, { kind: "signedIn" }>["account"];
/** A function that is not open yet shows its lock page at its own address, never a blank page (US-ONB-05, FR-ONB-02). */
function useLockPages(api: string, token: Token) {
  const locked = useUnlocks().entries.filter(isShownLocked);
  const ids = new Set(locked.map((e) => e.id));
  return {
    page: (id: string) =>
      ids.has(id) ? <UnlockPage api={api} token={token} id={id} /> : undefined,
    mark: (id: string) => {
      const entry = locked.find((e) => e.id === id);
      return entry ? lockMark(entry) : undefined;
    },
  };
}

/**
 * "Heute" with the introduction around its sections (US-QS-16): the app wires the shell into the area, and while
 * "social" is on the new plants of friends, and the locked functions, as tiles with their layers (issue 1156).
 */
function TodayRoute(props: { api: string; token: Token; onOpen: (v: LinkTarget) => void }) {
  const social = useFeature("social");
  const { api, token } = props;
  const tiles: TodayTile[] = [
    ...(social
      ? [
          {
            id: "news",
            tile: (draw: DrawTile) => <FriendsNewsTile api={api} token={token} tile={draw} />,
            layer: <FriendsNewsLayer api={api} token={token} />,
          },
        ]
      : []),
    { id: "locked", tile: (draw: DrawTile) => <LockedTile tile={draw} />, layer: <LockedLayer /> },
  ];
  return (
    <TodayArea
      api={props.api}
      token={props.token}
      onOpen={props.onOpen}
      tiles={tiles}
      intro={(sections, fallback) => (
        <>
          <Suspense fallback={null}>
            <WhatsNewHint />
          </Suspense>
          <TodayIntro
            lookup={SPECIES_LOOKUP}
            api={props.api}
            token={props.token}
            onOpen={props.onOpen}
            fallback={fallback}
          >
            {sections}
          </TodayIntro>
        </>
      )}
    />
  );
}

/** What the account may open: the role-bound views and, while "social" is on, "Freunde" (US-DEV-06, US-ONB-09). */
const rolesOf = (account: SignedIn, friends: boolean): Partial<Record<View, boolean>> => ({
  review: account.reviewer === true,
  operator: account.operator === true,
  friends,
});

/** "Freunde" and the exchange have routes only while "social" is on for the account (US-DEV-06); otherwise the address leads to "Heute" without a hint. */
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
  // "Freunde" follows the operator's switch of the account and the keeper's switch (US-ONB-09, via the features).
  const keeperSocial = useFeature("social");
  const roles = rolesOf(account, account.features?.social !== false && keeperSocial);
  const social = roles.friends !== false;
  const achievements = useFeature("achievement_views");
  const { pathname } = useLocation();
  const locks = useLockPages(api, s.token);
  return (
    <RouteBoundary resetKey={pathname} heading={destinationHeading(pathname)}>
      {achievements ? <AchievementNewsBanner api={api} token={s.token} /> : null}
      <Routes>
        <Route
          path={`${PATHS.account}/*`}
          element={
            <AccountArea
              api={api}
              token={s.token}
              account={account}
              onSignOut={s.signOut}
              onEverywhereSignOut={() => void s.everywhereSignOut()}
              overview={<FunctionOverview api={api} token={s.token} />}
              locks={(ids) => <LockedRows only={ids} />}
              {...(props.error ? { error: props.error } : {})}
            />
          }
        />
        {/* "Heute" is the home screen: the root address, old bookmarks and the brand lead there (US-QS-16). */}
        <Route path="/" element={<Navigate to={PATHS.today} replace />} />
        <Route path="/unlock/:id" element={<UnlockPage api={api} token={s.token} />} />
        {/* A scanned pot label opens its plant (US-BES-17); the id is opaque and the page asks the server as the keeper. */}
        <Route path="/label/:id" element={<PotLabelPage api={api} token={s.token} />} />
        {social && socialRoutes(api, s.token, locks.page, locks.mark)}
        <Route
          path={PATHS.today}
          element={<TodayRoute api={api} token={s.token} onOpen={props.onOpen} />}
        />
        {legacyRoutes()}
        {simpleRoutes(api, s.token, roles)}
        {handOverRoutes(api, s.token, h, props.onOpenProfile)}
        <Route path="*" element={<Navigate to={PATHS.today} replace />} />
      </Routes>
    </RouteBoundary>
  );
}
