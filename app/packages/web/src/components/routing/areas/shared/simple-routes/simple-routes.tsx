import type { ComponentType } from "react";
import { Navigate, Route } from "react-router";
import { OperatorPage } from "@/account";
import { ReviewPage } from "@/catalog";
import { FriendsPage } from "@/social";
import { PATHS, type View } from "@/components/shared/navigation/nav-model/navigation/navigation";

type Token = () => Promise<string | undefined>;

/** The views that need nothing but the API address and the token. */
const SIMPLE_VIEWS: Partial<Record<View, ComponentType<{ api: string; token: Token }>>> = {
  friends: FriendsPage,
  review: ReviewPage,
  operator: OperatorPage,
};

/** Shown on the start page when a role-bound address is opened without the role (P-10). */
const NO_ACCESS: Partial<Record<View, string>> = {
  review: "Die Prüfliste ist nur für Prüfende und den Betreiber sichtbar.",
  operator: "Der Betreiberbereich ist nur für den Betreiber sichtbar.",
};

/** One route per page that needs only the API address and the token; role-bound ones redirect without the role (P-10). */
export function simpleRoutes(api: string, token: Token, roles: Partial<Record<View, boolean>>) {
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
