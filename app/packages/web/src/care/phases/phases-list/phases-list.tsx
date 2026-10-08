import {
  phaseStatus,
  type LightLocation,
  type PhaseStatus,
  type PhasesRow,
} from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { CARD_CLASSES, LIST_CLASSES, WARNING_CLASSES } from "../../shared/notices/notices";
import { PHASE_TEXT, locationText, nextChangeText } from "../../shared/text";
import { needsSwitch, switchGroups, switchedText } from "../phase-groups";

/** Called with the specimens to switch and the text to show afterwards; without it the list only shows. */
export type Confirm = (specimenIds: readonly string[], success: string) => void;

function Entry(props: {
  row: PhasesRow;
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm | undefined;
}) {
  const { row: z, locations } = props;
  const status = phaseStatus(z);
  const canSwitch = props.onConfirm !== undefined && needsSwitch(z);
  return (
    <li className={`${CARD_CLASSES} flex flex-col gap-1`}>
      <h3 className="font-semibold">{z.name}</h3>
      <p>Soll-Phase heute: {PHASE_TEXT[z.phase]}</p>
      <p>{nextChangeText(z.nextChange)}</p>
      {z.nextChange === null && (
        <p className="font-semibold">Prüfe den Ruhephasen-Zeitraum im Pflegeprofil der Art.</p>
      )}
      {status === "location_missing" ? (
        <p className={WARNING_CLASSES}>Standort fehlt</p>
      ) : (
        <p className="text-muted-foreground">Standort: {locationText(locations, z.locationId)}</p>
      )}
      <p className="text-muted-foreground">
        Soll-Standort: {locationText(locations, z.targetLocationId)}
      </p>
      {status === "deviation" && (
        <p className={WARNING_CLASSES}>
          Weicht ab: steht am Standort „{locationText(locations, z.locationId)}“, Soll ist „
          {locationText(locations, z.targetLocationId)}“.
        </p>
      )}
      {status === "location_missing" && !canSwitch && (
        <p className="font-semibold">Weise dem Exemplar unter „Hinweise“ einen Standort zu.</p>
      )}
      {status === "in_place" && z.targetLocationId === null && (
        <p className="font-semibold">
          Wähle im Pflegeprofil der Art einen Soll-Standort für die {PHASE_TEXT[z.phase]}.
        </p>
      )}
      {canSwitch && (
        <>
          <p className="font-semibold">
            Stelle die Pflanze an den Soll-Standort und tippe dann „Jetzt umgestellt“.
          </p>
          <Button
            type="button"
            size="touch"
            className="mt-2"
            disabled={props.busy}
            aria-label={`Jetzt umgestellt: ${z.name}`}
            onClick={() => props.onConfirm?.([z.specimenId], switchedText([z], locations))}
          >
            Jetzt umgestellt
          </Button>
        </>
      )}
    </li>
  );
}

function Groups(props: {
  rows: readonly PhasesRow[];
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm;
}) {
  const groups = switchGroups(props.rows);
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const place = locationText(props.locations, g.targetLocationId);
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
}) {
  const busy = props.busy ?? false;
  if (props.rows.length === 0)
    return (
      <EmptyState
        title="Noch kein Exemplar hat eine Phase."
        description="Gelistet werden Pflanzen, deren Art einen Ruhephasen-Zeitraum hat. Lege im Bestand ein Exemplar einer solchen Art an."
        action={{ label: "Zum Bestand", href: "/collection" }}
      />
    );
  return (
    <section aria-labelledby="care-phases-title" className="flex flex-col gap-4">
      {props.onConfirm && (
        <Groups
          rows={props.rows}
          locations={props.locations}
          busy={busy}
          onConfirm={props.onConfirm}
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
