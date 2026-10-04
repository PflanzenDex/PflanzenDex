import { useState } from "react";
import type { LightLocation } from "@pflanzendex/core";

/**
 * Sets the location of a specimen (US-PHA-03, the action behind the hint "Standort fehlt"). The location is chosen from
 * the account's own locations, never typed (FR-PHA-03). Without any location the control says what to do first (P-09).
 */
export function LocateControl(props: {
  specimenName: string;
  locations: readonly LightLocation[];
  busy: boolean;
  onLocate: (locationId: string, success: string) => void;
  onCreateLocation: () => void;
}) {
  const { specimenName: name, locations } = props;
  const [choice, setChoice] = useState("");
  if (locations.length === 0)
    return (
      <>
        <p className="quiet">
          Du hast noch keinen Standort angelegt. Lege zuerst unter „Standorte und Licht“ einen
          Standort an.
        </p>
        <div className="actions">
          <button type="button" className="secondary" onClick={props.onCreateLocation}>
            Zu Standorte und Licht
          </button>
        </div>
      </>
    );
  const chosen = locations.find((s) => s.id === choice);
  return (
    <>
      <label>
        {`Standort für „${name}“`}
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Standort wählen …</option>
          {locations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={!chosen || props.busy}
          aria-label={`Standort setzen: ${name}`}
          onClick={() =>
            chosen &&
            props.onLocate(chosen.id, `„${name}“ steht jetzt am Standort „${chosen.name}“.`)
          }
        >
          Standort setzen
        </button>
      </div>
    </>
  );
}
