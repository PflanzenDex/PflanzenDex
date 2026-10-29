import type { ComponentType, ReactNode } from "react";
import { Navigate, Route, useParams } from "react-router";
import { OperatorPage } from "@/account";
import { ReviewPage } from "@/catalog";
import { FriendCollectionPage, FriendsPage } from "@/social";
import { ExchangePage } from "@/swap";
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
import {
  EXCHANGE_PATH,
  MATCH_PATH,
  PATHS,
  type View,
} from "@/components/shared/navigation/nav-model/navigation/navigation";

type Token = () => Promise<string | undefined>;

/** The match deck knows calm mode (US-TAU-07); the settings load only with it, not with the first load (DS-08). */
const MatchRoute = lazyPage(() =>
  import("./match-route/match-route").then((m) => ({ default: m.MatchRoute })),
);

/** The views that need nothing but the API address and the token. */
const SIMPLE_VIEWS: Partial<Record<View, ComponentType<{ api: string; token: Token }>>> = {
  friends: FriendsPage,
  review: ReviewPage,
  operator: OperatorPage,
};

/** Shown on "Heute" when a role-bound address is opened without the role (P-10). */
const NO_ACCESS: Partial<Record<View, string>> = {
  review: "Die Prüfliste ist nur für Prüfende und den Betreiber sichtbar.",
  operator: "Der Betreiberbereich ist nur für den Betreiber sichtbar.",
};

/** One route per page that needs only the API address and the token; role-bound ones redirect without the role (P-10). */
export function simpleRoutes(
  api: string,
  token: Token,
  roles: Partial<Record<View, boolean>>,
  /** A page that replaces the view while its function is not open yet (US-ONB-05). */
  locked: Partial<Record<View, ReactNode>> = {},
) {
  return (Object.keys(SIMPLE_VIEWS) as View[]).map((v) => {
    const Simple = SIMPLE_VIEWS[v];
    return Simple ? (
      <Route
        key={v}
        path={PATHS[v]}
        element={
          roles[v] === false ? (
            <Navigate to={PATHS.today} replace state={{ hint: NO_ACCESS[v] }} />
          ) : locked[v] ? (
            locked[v]
          ) : (
            <Simple api={api} token={token} />
          )
        }
      />
    ) : null;
  });
}

/** A friend's shared collection has its own address; the friendship id comes from it (US-SOZ-07). */
function FriendCollectionRoute(props: { api: string; token: Token }) {
  const { friendId } = useParams();
  return <FriendCollectionPage {...props} friendId={friendId ?? ""} />;
}

/**
 * The exchange and a friend's collection (US-SOZ-07, US-SOZ-08); while their function is not open yet the address
 * shows its lock page instead (US-ONB-05, FR-ONB-02).
 */
export function socialRoutes(
  api: string,
  token: Token,
  lockPage: (id: string) => ReactNode | undefined,
) {
  const page = (id: string, open: ReactNode) => lockPage(id) ?? open;
  return [
    <Route
      key="exchange"
      path={EXCHANGE_PATH}
      element={page("swapping", <ExchangePage api={api} token={token} />)}
    />,
    <Route
      key="match"
      path={MATCH_PATH}
      element={page("swapping", <MatchRoute api={api} token={token} />)}
    />,
    <Route
      key="friend"
      path={`${PATHS.friends}/:friendId`}
      element={page("friends", <FriendCollectionRoute api={api} token={token} />)}
    />,
  ];
}
