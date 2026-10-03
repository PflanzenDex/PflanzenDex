import type { ExemplarKarte } from "@pflanzendex/core";
import { ExemplarKarteAnsicht } from "./exemplar-karte";

/** Die Karten der Exemplare des Kontos. Jede Ansicht sagt, was als Nächstes zu tun ist (P-09). */
export function BestandListe(props: {
  karten: readonly ExemplarKarte[];
  onArtWaehlen: () => void;
  /** Öffnet die Messansicht; die App verdrahtet `bestand` mit `pflege` (US-WAC-01). */
  onMessen?: (e: { id: string; name: string }) => void;
  /** Öffnet das Archivieren eines Exemplars (US-BES-07). */
  onArchivieren?: (e: { id: string; name: string }) => void;
  /** Topft einen Steckling ein (US-BES-04). */
  onEintopfen?: (e: { id: string; name: string }) => void;
}) {
  return (
    <section aria-labelledby="bestand-titel">
      <h1 id="bestand-titel">Bestand</h1>
      {props.karten.length === 0 ? (
        <p>Du hast noch kein Exemplar. Wähle zuerst eine Art aus dem Katalog.</p>
      ) : (
        <ul className="karten-raster">
          {props.karten.map((k) => (
            <ExemplarKarteAnsicht
              key={k.id}
              karte={k}
              onMessen={props.onMessen}
              onArchivieren={props.onArchivieren}
              onEintopfen={props.onEintopfen}
            />
          ))}
        </ul>
      )}
      <div className="aktionen">
        <button type="button" className="primaer" onClick={props.onArtWaehlen}>
          {props.karten.length === 0 ? "Art wählen" : "Weiteres Exemplar: Art wählen"}
        </button>
      </div>
    </section>
  );
}
