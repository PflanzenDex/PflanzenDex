import { Navigate, Route, Routes, useLocation } from "react-router";
import {
  handOverRoutes,
  SPECIES_LOOKUP,
  type HandOver,
} from "@/components/routing/areas/collection-area/hand-over-routes/hand-over-routes";
import { useSession, type State } from "./account";
import { AchievementNewsBanner } from "@/components/routing/areas/shared/lazy-news-banner/lazy-news-banner";
import type { ComponentProps } from "react";
import {
  FunctionOverview,
  LockedRows,
  StartPage,
  UnlockPage,
  isShownLocked,
  useUnlocks,
} from "./shell";
import { RouteBoundary } from "@/components/routing/route-boundary/route-boundary";
import { AccountArea, TodayArea } from "@/components/routing/areas/shared/lazy-areas";
import {
  simpleRoutes,
  socialRoutes,
} from "@/components/routing/areas/shared/simple-routes/simple-routes";
import { legacyRoutes } from "@/components/routing/legacy-routes/legacy-routes";
import {
  PATHS,
  type LinkTarget,
  type View,
} from "./components/shared/navigation/nav-model/navigation/navigation";
function Start(props: Omit<ComponentProps<typeof StartPage>, "lookup">) {
  return <StartPage lookup={SPECIES_LOOKUP} {...props} />;
}
type Token = () => Promise<string | undefined>;
type SignedIn = Extract<State, { kind: "signedIn" }>["account"];
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
              locks={(ids) => <LockedRows only={ids} />}
              {...(props.error ? { error: props.error } : {})}
            />
          }
        />
        <Route
          path={PATHS.start}
          element={<Start api={api} token={s.token} onOpen={props.onOpen} />}
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
