import { useState, type FormEvent } from "react";
import { specimenName } from "@pflanzendex/core";
import type { ApiError } from "../kernel";
import { MARKER_MISSING, MarkerInput } from "./marker-fields";

/**
 * Give a specimen a marker or change it (US-BES-03). The new name is shown before saving (DM-BES-03); the form says
 * that only the name changes, not the history (renaming changes no references).
 */
export function MarkerForm(props: {
  name: string;
  speciesName: string | null;
  marker: string | null;
  onSend: (marker: string) => Promise<ApiError | null>;
  onCancel: () => void;
}) {
  const [marker, setMarker] = useState(props.marker ?? "");
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  const trimmed = marker.trim();
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!trimmed) return setError(MARKER_MISSING);
    setRunning(true);
    setError(await props.onSend(trimmed));
    setRunning(false);
  }
  return (
    <section aria-labelledby="marker-title">
      <h1 id="marker-title">Kennzeichen ändern</h1>
      <p className="lead">„{props.name}“</p>
      <p className="quiet">
        Nur der Name ändert sich: Messungen und Behandlungen bleiben beim Exemplar.
      </p>
      <form className="form" onSubmit={(e) => void send(e)} aria-label="Kennzeichen ändern">
        {props.speciesName && (
          <p className="name-preview" aria-live="polite">
            Name: {specimenName(props.speciesName, trimmed || null)}
          </p>
        )}
        <MarkerInput
          label="Kennzeichen"
          value={marker}
          onChange={(k) => {
            setMarker(k);
            setError(null);
          }}
        />
        {error && (
          <div role="alert" className="warning">
            <p>{error.text}</p>
          </div>
        )}
        <div className="actions">
          <button type="submit" className="primary" disabled={running}>
            Kennzeichen speichern
          </button>
          <button type="button" className="secondary" onClick={props.onCancel}>
            Abbrechen
          </button>
        </div>
      </form>
    </section>
  );
}
