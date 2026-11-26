import {
  phaseStatus,
  type LightLocation,
  type PhaseStatus,
  type PhasesRow,
} from "@pflanzendex/core";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { ADD_PLANT_PATH } from "@/shared/patterns/navigation/navigation/navigation";
import { Button } from "@/shared/ui/button";
import { UndoRow } from "@/shared/feedback/undo-row/undo-row";
import { texts } from "@/shared/lib/text-rules/texts";
import { LIST_CLASSES } from "../../shared/notices/notices";
import { locationText } from "../../shared/text";
import { switchGroups, switchedText } from "../phase-groups";
import { Entry, type Confirm } from "./entry/entry";
import table from "./phases-list.de.json";

export type { Confirm };

/** The undo of a bulk move that is held in place for its target location (US-QS-32): what its group shows instead of its button. */
export type GroupUndo = (
  targetLocationId: string,
) => { busy: boolean; onUndo: () => void } | undefined;

const ui = texts(table);

export function Groups(props: {
  rows: readonly PhasesRow[];
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm;
  groupUndo?: GroupUndo | undefined;
}) {
  const groups = switchGroups(props.rows);
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const place = locationText(props.locations, g.targetLocationId);
        const undo = props.groupUndo?.(g.targetLocationId);
        if (undo)
          return (
            <UndoRow
              key={g.targetLocationId}
              result={ui("movedResult")}
              subject={ui("groupSubject", { count: g.rows.length, place })}
              busy={undo.busy}
              onUndo={undo.onUndo}
            />
          );
        return (
          <Button
            key={g.targetLocationId}
            type="button"
            variant="secondary"
            size="touch"
            disabled={props.busy}
            onClick={() =>
              props.onConfirm(
                g.rows.map((z) => z.specimenId),
                switchedText(g.rows, props.locations),
                g.rows,
              )
            }
          >
            {`Alle ${g.rows.length} nach ${place} umstellen`}
          </Button>
        );
      })}
    </div>
  );
}

const SECTIONS: readonly { status: PhaseStatus; title: string }[] = [
  { status: "deviation", title: "Weichen vom Soll ab" },
  { status: "location_missing", title: "Standort fehlt" },
  { status: "in_place", title: "Stimmen überein oder Soll unbekannt" },
];

/** Deviations first (US-PHA-02): the server sends the rows in that order, the groups only name it. */
function Sections(props: {
  rows: readonly PhasesRow[];
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm | undefined;
}) {
  const deviations = props.rows.some((z) => phaseStatus(z) === "deviation");
  return (
    <div className="flex flex-col gap-6">
      {!deviations && (
        <p className="text-muted-foreground">
          Keine Abweichung: Jede Pflanze mit bekanntem Soll-Standort steht dort.
        </p>
      )}
      {SECTIONS.map(({ status, title }) => {
        const rows = props.rows.filter((z) => phaseStatus(z) === status);
        if (rows.length === 0) return null;
        return (
          <section
            key={status}
            aria-labelledby={`care-phases-${status}`}
            className="flex flex-col gap-3"
          >
            <h2 id={`care-phases-${status}`} className="text-xl font-semibold">
              {`${title} (${rows.length})`}
            </h2>
            <ul className={LIST_CLASSES}>
              {rows.map((z) => (
                <Entry
                  key={z.specimenId}
                  row={z}
                  locations={props.locations}
                  busy={props.busy}
                  onConfirm={props.onConfirm}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** The expected phase per specimen. Every view says what to do next (P-09). */
export function PhasesList(props: {
  rows: readonly PhasesRow[];
  locations: readonly LightLocation[];
  busy?: boolean;
  onConfirm?: Confirm;
  groupUndo?: GroupUndo | undefined;
}) {
  const busy = props.busy ?? false;
  if (props.rows.length === 0)
    return (
      <EmptySection text={ui("none")} action={{ label: ui("addPlant"), href: ADD_PLANT_PATH }} />
    );
  return (
    <section aria-labelledby="care-phases-title" className="flex flex-col gap-4">
      {props.onConfirm && (
        <Groups
          rows={props.rows}
          locations={props.locations}
          busy={busy}
          onConfirm={props.onConfirm}
          groupUndo={props.groupUndo}
        />
      )}
      <Sections
        rows={props.rows}
        locations={props.locations}
        busy={busy}
        onConfirm={props.onConfirm}
      />
    </section>
  );
}
