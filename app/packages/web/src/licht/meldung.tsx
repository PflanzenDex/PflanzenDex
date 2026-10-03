import type { ApiFehler } from "./licht-api";
import { feldNamen, nutzerText } from "./text";

/** Fehler des Servers mit dem, was als Nächstes zu tun ist (P-09); bei einer genutzten Zone mit allen Nutzern (P-10). */
export function FehlerMeldung({ fehler }: { fehler: ApiFehler }) {
  const felder = feldNamen(fehler);
  return (
    <div role="alert" className="warnung">
      <p>{fehler.text}</p>
      {felder.length > 0 && <p>Bitte prüfe: {felder.join(", ")}.</p>}
      {fehler.daten && fehler.daten.length > 0 && (
        <ul className="nutzer">
          {fehler.daten.map((n) => (
            <li key={`${n.art}-${n.id}`}>{nutzerText(n)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
