import type { ComponentType, ReactNode } from "react";
import { Navigate, Route, useParams } from "react-router";
import { OperatorPage } from "@/account";
import { ReviewPage } from "@/catalog";
import { FriendCollectionPage, FriendsPage } from "@/social";
import { ExchangePage, MatchPage } from "@/swap";
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
import {
  EXCHANGE_PATH,
  MATCH_PATH,
  PATHS,
  type View,
} from "@/components/shared/navigation/nav-model/navigation/navigation";

type Token = () => Promise<string | undefined>;

/** Calm mode comes from the settings, which load only with this part (US-TAU-07, US-QS-20, DS-08). */
const CalmGate = lazyPage(() => import("./calm-gate/calm-gate"));

/** The views that need nothing but the API address and the token. */
const SIMPLE_VIEWS: Partial<Record<View, ComponentType<{ api: string; token: Token }>>> = {
  review: ReviewPage,
  operator: OperatorPage,
};

/** Shown on "Heute" when a role-bound address is opened without the role (P-10). */
const NO_ACCESS: Partial<Record<View, string>> = {
  review: "Die Prüfliste ist nur für Prüfende und den Betreiber sichtbar.",
  operator: "Der Betreiberbereich ist nur für den Betreiber sichtbar.",
};

/** One route per page that needs only the API address and the token; role-bound ones redirect without the role (P-10). */
export function simpleRoutes(api: string, token: Token, roles: Partial<Record<View, boolean>>) {
  return (
    Object.entries(SIMPLE_VIEWS) as [View, ComponentType<{ api: string; token: Token }>][]
  ).map(([v, Simple]) => (
    <Route
      key={v}
      path={PATHS[v]}
      element={
        roles[v] === false ? (
          <Navigate to={PATHS.today} replace state={{ hint: NO_ACCESS[v] }} />
        ) : (
          <Simple api={api} token={token} />
        )
      }
    />
  ));
}

/** A friend's shared collection has its own address; the friendship id comes from it (US-SOZ-07). */
function FriendCollectionRoute(props: { api: string; token: Token }) {
  const { friendId } = useParams();
  return <FriendCollectionPage {...props} friendId={friendId ?? ""} />;
}

/**
 * "Freunde", the exchange and a friend's collection (US-QS-20, US-SOZ-07, US-SOZ-08); while their function is not open yet the address
 * shows its lock page instead (US-ONB-05, FR-ONB-02).
 */
export function socialRoutes(
  api: string,
  token: Token,
  lockPage: (id: string) => ReactNode | undefined,
  /** The text mark of a function that is not open yet ("Bald", "Noch gesperrt"), by function id (US-ONB-05). */
  lockMarkOf: (id: string) => string | undefined = () => undefined,
) {
  const swapMark = lockMarkOf("swapping");
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
      element={page("swapping", <CalmGate page={MatchPage} api={api} token={token} />)}
    />,
    <Route key="friends" path={PATHS.friends}>
      <Route
        index
        element={page(
          "friends",
          <CalmGate
            page={FriendsPage}
            api={api}
            token={token}
            {...(swapMark ? { swapMark } : {})}
          />,
        )}
      />
      <Route
        path=":friendId"
        element={page("friends", <FriendCollectionRoute api={api} token={token} />)}
      />
    </Route>,
  ];
}
