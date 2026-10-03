import type { LichtStandort, PhasenZeile } from "@pflanzendex/core";
import { PHASENTEXT, standortText } from "./text";

/** Die erwartete Phase je Exemplar. Jede Ansicht sagt, was als Nächstes zu tun ist (P-09). */
export function PhasenListe(props: {
  zeilen: readonly PhasenZeile[];
  standorte: readonly LichtStandort[];
}) {
  return (
    <section aria-labelledby="pflegephasen-titel">
      <h1 id="pflegephasen-titel">Pflegephasen</h1>
      {props.zeilen.length === 0 ? (
        <p>
          Noch kein Exemplar hat eine Phase: Gelistet werden Pflanzen, deren Art einen
          Ruhephasen-Zeitraum hat. Lege im Bestand ein Exemplar einer solchen Art an.
        </p>
      ) : (
        <ul className="liste">
          {props.zeilen.map((z) => (
            <li key={z.exemplarId} className="eintrag">
              <h3>{z.name}</h3>
              <p>Soll-Phase heute: {PHASENTEXT[z.phase]}</p>
              <p className="leise">Standort: {standortText(props.standorte, z.standortId)}</p>
              <p className="leise">
                Soll-Standort: {standortText(props.standorte, z.sollStandortId)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
