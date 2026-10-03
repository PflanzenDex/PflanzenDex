import { Fehler, KontoAnsicht, Laedt, Willkommen } from "./auth/ansichten";
import { useSitzung } from "./auth/sitzung";
import "./stil.css";

export function App() {
  const s = useSitzung();
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
        <KontoAnsicht
          konto={z.konto}
          onAbmelden={s.abmelden}
          onUeberallAbmelden={() => void s.ueberallAbmelden()}
          {...(z.fehler ? { fehler: z.fehler } : {})}
        />
      )}
    </main>
  );
}
