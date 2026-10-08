import type { SpecimenCard } from "@pflanzendex/core";
import type { PhotoAccess } from "@/lib/use-stored-photo";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Button } from "@/components/ui/button/button";
import { SectionLabel } from "@/components/section-label/section-label";
import { groupByLocation } from "@/components/sammlung-header/location-groups/group-by-location";
import { Actions, GRID, TITLE } from "../parts/parts";
import { SpecimenCardView } from "../specimen-card/specimen-card";

type Handlers = {
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
  /** How the private photos on the cards are fetched (US-WAC-05, P-05). */
  photoAccess: PhotoAccess;
};

function Grid(props: Handlers & { cards: readonly SpecimenCard[] }) {
  return (
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
          photoAccess={props.photoAccess}
        />
      ))}
    </ul>
  );
}

/** The cards, as one grid or grouped by location with its zone, each group below its heading (US-QS-14). */
function Cards(props: Handlers & { cards: readonly SpecimenCard[]; groupBy?: "location" }) {
  if (props.groupBy !== "location") return <Grid {...props} />;
  return (
    <div className="flex flex-col gap-6">
      {groupByLocation(props.cards).map((g, i) => (
        <section
          key={g.key}
          aria-labelledby={`location-group-${i}`}
          className="flex flex-col gap-3"
        >
          <SectionLabel id={`location-group-${i}`}>{g.title}</SectionLabel>
          <Grid {...props} cards={g.items} />
        </section>
      ))}
    </div>
  );
}

/** The cards of the specimens of the account. Every view says what to do next (P-09). */
export function CollectionList(
  props: Handlers & {
    cards: readonly SpecimenCard[];
    onSpeciesChoose: () => void;
    /** Shown below the title of a destination (US-QS-14): the heading is then a screen reader section name, not the page title. */
    embedded?: boolean;
    /** Groups the cards by location and zone, each group below a heading (US-QS-14). */
    groupBy?: "location";
  },
) {
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
          <Cards {...props} />
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
