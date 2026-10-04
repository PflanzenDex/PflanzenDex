import type { LightLocation, PhasesRow } from "@pflanzendex/core";
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
  return (
    <li className="entry">
      <h3>{z.name}</h3>
      <p>Soll-Phase heute: {PHASE_TEXT[z.phase]}</p>
      <p className="quiet">Standort: {locationText(locations, z.locationId)}</p>
      <p className="quiet">Soll-Standort: {locationText(locations, z.targetLocationId)}</p>
      {props.onConfirm && needsSwitch(z) && (
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
          <ul className="list">
            {props.rows.map((z) => (
              <Entry
                key={z.specimenId}
                row={z}
                locations={props.locations}
                busy={busy}
                onConfirm={props.onConfirm}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
