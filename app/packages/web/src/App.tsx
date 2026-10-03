import { useState } from "react";
import type { Species } from "@pflanzendex/core";
import { CollectionArea } from "./collection-area";
import { AppError, AccountView, Loading, Welcome, apiUrl, useSession } from "./account";
import { LightPage } from "./light";
import { SpeciesPage } from "./catalog";
import { CarePhasesPage } from "./care";
import { Navigation, type View } from "./navigation";
import "./style.css";

const api = apiUrl(import.meta.env as Record<string, string | undefined>);

const version = (import.meta.env as Record<string, string | undefined>)["VITE_APP_VERSION"];

export function App() {
  const s = useSession();
  const [view, setView] = useState<View>("species");
  // The chosen species travels from the catalog to the collection: the app wires both modules (US-BES-02).
  const [newSpecies, setNewSpecies] = useState<Species | null>(null);
  const choose = (species: Species) => {
    setNewSpecies(species);
    setView("collection");
  };
  const toTheCatalog = () => {
    setNewSpecies(null);
    setView("species");
  };
  const z = s.state;
  return (
    <main className="page">
      {z.kind === "loading" && <Loading />}
      {z.kind === "error" && <AppError text={z.text} onReload={() => void s.reload()} />}
      {z.kind === "signedOut" && (
        <Welcome
          onRegister={s.register}
          onSignIn={s.signIn}
          {...(z.hint ? { hint: z.hint } : {})}
        />
      )}
      {z.kind === "signedIn" && (
        <div className="frame">
          <Navigation active={view} onSwitch={setView} />
          {view === "account" ? (
            <AccountView
              account={z.account}
              onSignOut={s.signOut}
              onEverywhereSignOut={() => void s.everywhereSignOut()}
              {...(z.error ? { error: z.error } : {})}
            />
          ) : view === "light" ? (
            <LightPage api={api} token={s.token} />
          ) : view === "carePhases" ? (
            <CarePhasesPage api={api} token={s.token} />
          ) : view === "collection" ? (
            <CollectionArea
              api={api}
              token={s.token}
              newSpecies={newSpecies}
              onSpeciesChoose={toTheCatalog}
              onCompleted={() => setNewSpecies(null)}
            />
          ) : (
            <SpeciesPage api={api} token={s.token} onChoose={choose} />
          )}
        </div>
      )}
      <footer className="version-footer">Version {version || "unbekannt"}</footer>
    </main>
  );
}
