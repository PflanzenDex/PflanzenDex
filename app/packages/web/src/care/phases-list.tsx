import {
  phaseStatus,
  type LightLocation,
  type PhaseStatus,
  type PhasesRow,
} from "@pflanzendex/core";
import "./care.css";
import { PHASE_TEXT, locationText } from "./text";
import { needsSwitch, switchGroups, switchedText } from "./phase-groups";

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
    <li className="entry">
      <h3>{z.name}</h3>
      <p>Soll-Phase heute: {PHASE_TEXT[z.phase]}</p>
      {status === "location_missing" ? (
        <p className="warning">Standort fehlt</p>
      ) : (
        <p className="quiet">Standort: {locationText(locations, z.locationId)}</p>
      )}
      <p className="quiet">Soll-Standort: {locationText(locations, z.targetLocationId)}</p>
      {status === "deviation" && (
        <p className="warning">
          Weicht ab: steht am Standort „{locationText(locations, z.locationId)}“, Soll ist „
          {locationText(locations, z.targetLocationId)}“.
        </p>
      )}
      {status === "location_missing" && !canSwitch && (
        <p className="next-action">Weise dem Exemplar unter „Hinweise“ einen Standort zu.</p>
      )}
      {status === "in_place" && z.targetLocationId === null && (
        <p className="next-action">
          Wähle im Pflegeprofil der Art einen Soll-Standort für die {PHASE_TEXT[z.phase]}.
        </p>
      )}
      {canSwitch && (
        <>
          <p className="next-action">
            Stelle die Pflanze an den Soll-Standort und tippe dann „Jetzt umgestellt“.
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={props.busy}
              aria-label={`Jetzt umgestellt: ${z.name}`}
              onClick={() => props.onConfirm?.([z.specimenId], switchedText([z], locations))}
            >
              Jetzt umgestellt
            </button>
          </div>
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
    <div className="actions phase-groups">
      {groups.map((g) => {
        const place = locationText(props.locations, g.targetLocationId);
        return (
          <button
            key={g.targetLocationId}
            type="button"
            className="secondary"
            disabled={props.busy}
            onClick={() =>
              props.onConfirm(
                g.rows.map((z) => z.specimenId),
                switchedText(g.rows, props.locations),
              )
            }
          >
            {`Alle ${g.rows.length} nach ${place} umstellen`}
          </button>
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
    <>
      {!deviations && (
        <p className="hint">
          Keine Abweichung: Jede Pflanze mit bekanntem Soll-Standort steht dort.
        </p>
      )}
      {SECTIONS.map(({ status, title }) => {
        const rows = props.rows.filter((z) => phaseStatus(z) === status);
        if (rows.length === 0) return null;
        return (
          <section key={status} aria-labelledby={`care-phases-${status}`}>
            <h2 id={`care-phases-${status}`}>{`${title} (${rows.length})`}</h2>
            <ul className="list">
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
    </>
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
  return (
    <section aria-labelledby="care-phases-title">
      <h1 id="care-phases-title">Pflegephasen</h1>
      {props.rows.length === 0 ? (
        <p>
          Noch kein Exemplar hat eine Phase: Gelistet werden Pflanzen, deren Art einen
          Ruhephasen-Zeitraum hat. Lege im Bestand ein Exemplar einer solchen Art an.
        </p>
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}
