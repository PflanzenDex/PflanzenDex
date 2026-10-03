import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { PHASE_TEXT, locationText } from "./text";

/** The expected phase per specimen. Every view says what to do next (P-09). */
export function PhasesList(props: {
  rows: readonly PhasesRow[];
  locations: readonly LightLocation[];
}) {
  return (
    <section aria-labelledby="care-phases-title">
      <h1 id="care-phases-title">Pflegephasen</h1>
      {props.rows.length === 0 ? (
        <p>
          Noch kein Exemplar hat eine Phase: Gelistet werden Pflanzen, deren Art einen
          Ruhephasen-Zeitraum hat. Lege im Bestand ein Exemplar einer solchen Art an.
        </p>
      ) : (
        <ul className="list">
          {props.rows.map((z) => (
            <li key={z.specimenId} className="entry">
              <h3>{z.name}</h3>
              <p>Soll-Phase heute: {PHASE_TEXT[z.phase]}</p>
              <p className="quiet">Standort: {locationText(props.locations, z.locationId)}</p>
              <p className="quiet">
                Soll-Standort: {locationText(props.locations, z.targetLocationId)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
