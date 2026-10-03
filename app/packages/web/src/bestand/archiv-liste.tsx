import type { ArchivEintrag } from "@pflanzendex/core";
import { UNBEKANNT, datumText } from "./text";

/**
 * Das Archiv (US-BES-07): archivierte Exemplare mit Art, Datum und Grund, jedes mit „Wiederherstellen“. Ohne
 * archivierte Exemplare gibt es den Abschnitt nicht.
 */
export function ArchivListe(props: {
  eintraege: readonly ArchivEintrag[];
  onWiederherstellen: (e: { id: string; name: string }) => void;
}) {
  if (props.eintraege.length === 0) return null;
  return (
    <section aria-labelledby="archiv-titel" className="archiv">
      <h2 id="archiv-titel">Archiv</h2>
      <p className="leise">
        Archivierte Exemplare fehlen in Liste und Auswertungen. Ihre Historie bleibt erhalten.
      </p>
      <ul className="karten-raster">
        {props.eintraege.map((e) => (
          <li key={e.id} className="exemplar-karte">
            <h3>{e.name}</h3>
            <p className="leise">Art: {e.artName ?? UNBEKANNT}</p>
            <p className="leise">Archiviert am {datumText(e.archiviertAm)}</p>
            <p className="leise">Grund: {e.archiviertGrund}</p>
            <div className="aktionen">
              <button
                type="button"
                className="sekundaer"
                aria-label={`Wiederherstellen: ${e.name}`}
                onClick={() => props.onWiederherstellen(e)}
              >
                Wiederherstellen
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
