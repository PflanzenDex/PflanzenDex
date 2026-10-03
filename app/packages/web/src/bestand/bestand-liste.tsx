import type { Exemplar, LichtStandort } from "@pflanzendex/core";
import { UNBEKANNT, datumText, standortText } from "./text";

function Karte(props: {
  e: Exemplar;
  standorte: readonly LichtStandort[];
  onMessen: ((e: Exemplar) => void) | undefined;
}) {
  const { e, standorte, onMessen } = props;
  return (
    <li className="eintrag">
      <h3>{e.name}</h3>
      <p className="leise">Standort: {standortText(standorte, e.standortId)}</p>
      <p className="leise">
        {e.gefangenAm ? `Gefangen am ${datumText(e.gefangenAm)}` : `Gefangen am: ${UNBEKANNT}`}
      </p>
      <p className="leise">
        {e.messreihe.length === 0 ? "noch keine Messung" : `${e.messreihe.length} Messungen`} ·{" "}
        {e.behandlungen.length === 0 ? "keine Behandlung" : `${e.behandlungen.length} Behandlungen`}
      </p>
      {onMessen && (
        <div className="aktionen">
          <button
            type="button"
            className="sekundaer"
            aria-label={`Messen: ${e.name}`}
            onClick={() => onMessen(e)}
          >
            Messen
          </button>
        </div>
      )}
    </li>
  );
}

/** Die Exemplare des Kontos. Jede Ansicht sagt, was als Nächstes zu tun ist (P-09). */
export function BestandListe(props: {
  exemplare: readonly Exemplar[];
  standorte: readonly LichtStandort[];
  onArtWaehlen: () => void;
  /** Öffnet die Messansicht; die App verdrahtet `bestand` mit `pflege` (US-WAC-01). */
  onMessen?: (e: Exemplar) => void;
}) {
  return (
    <section aria-labelledby="bestand-titel">
      <h1 id="bestand-titel">Bestand</h1>
      {props.exemplare.length === 0 ? (
        <p>Du hast noch kein Exemplar. Wähle zuerst eine Art aus dem Katalog.</p>
      ) : (
        <ul className="liste">
          {props.exemplare.map((e) => (
            <Karte key={e.id} e={e} standorte={props.standorte} onMessen={props.onMessen} />
          ))}
        </ul>
      )}
      <div className="aktionen">
        <button type="button" className="primaer" onClick={props.onArtWaehlen}>
          {props.exemplare.length === 0 ? "Art wählen" : "Weiteres Exemplar: Art wählen"}
        </button>
      </div>
    </section>
  );
}
