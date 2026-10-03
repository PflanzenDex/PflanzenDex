import { useState } from "react";
import type { Art } from "@pflanzendex/core";
import { BestandBereich } from "./bestand-bereich";
import { Fehler, KontoAnsicht, Laedt, Willkommen, apiUrl, useSitzung } from "./konto";
import { LichtSeite } from "./licht";
import { ArtenSeite } from "./katalog";
import { PflegephasenSeite } from "./pflege";
import { Navigation, type Ansicht } from "./navigation";
import "./stil.css";

const api = apiUrl(import.meta.env as Record<string, string | undefined>);

const version = (import.meta.env as Record<string, string | undefined>)["VITE_APP_VERSION"];

export function App() {
  const s = useSitzung();
  const [ansicht, setAnsicht] = useState<Ansicht>("arten");
  // Die gewählte Art wandert vom Katalog zum Bestand: die App verdrahtet beide Module (US-BES-02).
  const [neueArt, setNeueArt] = useState<Art | null>(null);
  const waehle = (art: Art) => {
    setNeueArt(art);
    setAnsicht("bestand");
  };
  const zumKatalog = () => {
    setNeueArt(null);
    setAnsicht("arten");
  };
  const z = s.zustand;
  return (
    <main className="seite">
      {z.art === "laedt" && <Laedt />}
      {z.art === "fehler" && <Fehler text={z.text} onNeuLaden={() => void s.neuLaden()} />}
      {z.art === "abgemeldet" && (
        <Willkommen
          onRegistrieren={s.registrieren}
          onAnmelden={s.anmelden}
          {...(z.hinweis ? { hinweis: z.hinweis } : {})}
        />
      )}
      {z.art === "angemeldet" && (
        <div className="rahmen">
          <Navigation aktiv={ansicht} onWechsel={setAnsicht} />
          {ansicht === "konto" ? (
            <KontoAnsicht
              konto={z.konto}
              onAbmelden={s.abmelden}
              onUeberallAbmelden={() => void s.ueberallAbmelden()}
              {...(z.fehler ? { fehler: z.fehler } : {})}
            />
          ) : ansicht === "licht" ? (
            <LichtSeite api={api} token={s.token} />
          ) : ansicht === "pflegephasen" ? (
            <PflegephasenSeite api={api} token={s.token} />
          ) : ansicht === "bestand" ? (
            <BestandBereich
              api={api}
              token={s.token}
              neueArt={neueArt}
              onArtWaehlen={zumKatalog}
              onAbgeschlossen={() => setNeueArt(null)}
            />
          ) : (
            <ArtenSeite api={api} token={s.token} onWaehlen={waehle} />
          )}
        </div>
      )}
      <footer className="versionsfuss">Version {version || "unbekannt"}</footer>
    </main>
  );
}
