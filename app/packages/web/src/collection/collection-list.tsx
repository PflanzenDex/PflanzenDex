import type { Specimen, LightLocation } from "@pflanzendex/core";
import { UNKNOWN, dateText, locationText } from "./text";

function Card({ e, locations }: { e: Specimen; locations: readonly LightLocation[] }) {
  return (
    <li className="entry">
      <h3>{e.name}</h3>
      <p className="quiet">Standort: {locationText(locations, e.locationId)}</p>
      <p className="quiet">
        {e.caughtAt ? `Gefangen am ${dateText(e.caughtAt)}` : `Gefangen am: ${UNKNOWN}`}
      </p>
      <p className="quiet">
        {e.measurements.length === 0 ? "noch keine Messung" : `${e.measurements.length} Messungen`}{" "}
        · {e.treatments.length === 0 ? "keine Behandlung" : `${e.treatments.length} Behandlungen`}
      </p>
    </li>
  );
}

/** The specimens of the account. Every view says what to do next (P-09). */
export function CollectionList(props: {
  specimens: readonly Specimen[];
  locations: readonly LightLocation[];
  onSpeciesChoose: () => void;
}) {
  return (
    <section aria-labelledby="collection-title">
      <h1 id="collection-title">Bestand</h1>
      {props.specimens.length === 0 ? (
        <p>Du hast noch kein Exemplar. Wähle zuerst eine Art aus dem Katalog.</p>
      ) : (
        <ul className="list">
          {props.specimens.map((e) => (
            <Card key={e.id} e={e} locations={props.locations} />
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="button" className="primary" onClick={props.onSpeciesChoose}>
          {props.specimens.length === 0 ? "Art wählen" : "Weiteres Exemplar: Art wählen"}
        </button>
      </div>
    </section>
  );
}
