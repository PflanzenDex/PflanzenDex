import type { SpecimenCard } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Actions, GRID, TITLE } from "./parts";
import { SpecimenCardView } from "./specimen-card";

/** The cards of the specimens of the account. Every view says what to do next (P-09). */
export function CollectionList(props: {
  cards: readonly SpecimenCard[];
  onSpeciesChoose: () => void;
  /** Shown below the title of a destination (US-QS-14): the heading is then a screen reader section name, not the page title. */
  embedded?: boolean;
  /** Opens the measure view; the app wires `collection` with `care` (US-WAC-01). */
  onMeasure?: (e: { id: string; name: string }) => void;
  /** Opens the archiving of a specimen (US-BES-07). */
  onArchive?: (e: { id: string; name: string }) => void;
  /** Repots a cutting (US-BES-04). */
  onRepot?: (e: { id: string; name: string }) => void;
  /** Gives a specimen a marker or changes it (US-BES-03). */
  onMark?: (e: SpecimenCard) => void;
  /** Corrects the catch date of a specimen (US-BES-11). */
  onCatchDate?: (e: SpecimenCard) => void;
}) {
  return (
    <section aria-labelledby="collection-title">
      {props.embedded ? (
        <h2 id="collection-title" className="sr-only">
          Pflanzen
        </h2>
      ) : (
        <h1 id="collection-title" className={TITLE}>
          Bestand
        </h1>
      )}
      {props.cards.length === 0 ? (
        <EmptyState
          title="Du hast noch kein Exemplar."
          description="Wähle zuerst eine Art aus dem Katalog."
          action={{ label: "Art wählen", onClick: props.onSpeciesChoose }}
        />
      ) : (
        <>
          <ul className={GRID}>
            {props.cards.map((k) => (
              <SpecimenCardView
                key={k.id}
                card={k}
                onMeasure={props.onMeasure}
                onArchive={props.onArchive}
                onRepot={props.onRepot}
                onMark={props.onMark}
                onCatchDate={props.onCatchDate}
              />
            ))}
          </ul>
          <Actions>
            <Button type="button" size="touch" onClick={props.onSpeciesChoose}>
              Weiteres Exemplar: Art wählen
            </Button>
          </Actions>
        </>
      )}
    </section>
  );
}
