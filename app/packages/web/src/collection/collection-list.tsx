import type { SpecimenCard } from "@pflanzendex/core";
import { SpecimenCardView } from "./specimen-card";

/** The cards of the specimens of the account. Every view says what to do next (P-09). */
export function CollectionList(props: {
  cards: readonly SpecimenCard[];
  onSpeciesChoose: () => void;
  /** Opens the measure view; the app wires `collection` with `care` (US-WAC-01). */
  onMeasure?: (e: { id: string; name: string }) => void;
  /** Opens the archiving of a specimen (US-BES-07). */
  onArchive?: (e: { id: string; name: string }) => void;
  /** Repots a cutting (US-BES-04). */
  onRepot?: (e: { id: string; name: string }) => void;
  /** Gives a specimen a marker or changes it (US-BES-03). */
  onMark?: (e: SpecimenCard) => void;
}) {
  return (
    <section aria-labelledby="collection-title">
      <h1 id="collection-title">Bestand</h1>
      {props.cards.length === 0 ? (
        <p>Du hast noch kein Exemplar. Wähle zuerst eine Art aus dem Katalog.</p>
      ) : (
        <ul className="cards-grid">
          {props.cards.map((k) => (
            <SpecimenCardView
              key={k.id}
              card={k}
              onMeasure={props.onMeasure}
              onArchive={props.onArchive}
              onRepot={props.onRepot}
              onMark={props.onMark}
            />
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="button" className="primary" onClick={props.onSpeciesChoose}>
          {props.cards.length === 0 ? "Art wählen" : "Weiteres Exemplar: Art wählen"}
        </button>
      </div>
    </section>
  );
}
