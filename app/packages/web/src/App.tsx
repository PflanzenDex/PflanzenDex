import { useState } from "react";
import { Fehler, KontoAnsicht, Laedt, Willkommen } from "./auth/ansichten";
import { apiUrl } from "./auth/konto-api";
import { useSitzung } from "./auth/sitzung";
import { LichtSeite } from "./licht/LichtSeite";
import { Navigation, type Ansicht } from "./navigation";
import "./stil.css";
import "./licht/licht.css";

const api = apiUrl(import.meta.env as Record<string, string | undefined>);

const version = (import.meta.env as Record<string, string | undefined>)["VITE_APP_VERSION"];

export function App() {
  const s = useSitzung();
  const [ansicht, setAnsicht] = useState<Ansicht>("licht");
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
          ) : (
            <LichtSeite api={api} token={s.token} />
          )}
        </div>
      )}
      <footer className="versionsfuss">Version {version || "unbekannt"}</footer>
    </main>
  );
}
