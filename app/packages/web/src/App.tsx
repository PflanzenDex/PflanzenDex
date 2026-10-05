import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Species } from "@pflanzendex/core";
import {
  AppError,
  Loading,
  Welcome,
  apiUrl,
  useSession,
  InvitationPage,
  type State,
} from "./account";
import { useClearOnSignOut } from "./kernel";
import { AppRoutes } from "./routes";
import { AppShell } from "./components/shared/app-shell";
import { navItems, PATHS, type View } from "./navigation";

const api = apiUrl(import.meta.env as Record<string, string | undefined>);

const version = (import.meta.env as Record<string, string | undefined>)["VITE_APP_VERSION"];

/** The active view comes from the address; going to a view is a navigation, so back and deep links work (US-QS-07). */
function useViews() {
  const navigate = useNavigate();
  const setView = (next: View) => void navigate(PATHS[next]);
  // The Pokédex links to a species profile, so the app wires pokedex and catalog (US-POK-09).
  const openProfile = (id: string) => void navigate(`${PATHS.species}/${encodeURIComponent(id)}`);
  return { setView, openProfile };
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
  const { setView, openProfile } = useViews();
  const { state: navState } = useLocation() as { state: { hint?: string } | null };
  const handOver = useSpeciesHandOver(setView);
  const z = s.state;
  useClearOnSignOut(z.kind === "signedIn");
  const footer = (
    <footer className="mt-8 text-center text-xs text-muted-foreground">
      Version {version || "unbekannt"}
    </footer>
  );
  if (z.kind !== "signedIn")
    return (
      <main className="flex min-h-dvh flex-col items-center px-4 py-6 md:pt-20">
        <EntryStates state={z} session={s} />
        {footer}
      </main>
    );
  return (
    <AppShell
      items={navItems({
        reviewer: z.account.reviewer === true,
        operator: z.account.operator === true,
      })}
    >
      <div className="mx-auto w-full max-w-180">
        {navState?.hint && (
          <p role="alert" className="mb-3 rounded-lg border border-border p-3">
            {navState.hint}
          </p>
        )}
        <AppRoutes
          api={api}
          session={s}
          account={z.account}
          {...(z.error ? { error: z.error } : {})}
          onOpen={setView}
          onOpenProfile={openProfile}
          handOver={handOver}
        />
      </div>
      {footer}
    </AppShell>
  );
}
