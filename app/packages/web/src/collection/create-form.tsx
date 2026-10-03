import { useState, type FormEvent } from "react";
import {
  speciesDisplayName,
  specimenName,
  type Species,
  type LightLocation,
} from "@pflanzendex/core";
import type { ApiError } from "../kernel";
import { nameConflict } from "./text";

export interface CreateInput {
  marker?: string;
  locationId?: string;
  /** Only "cutting" is sent; without a value the specimen is a plant (US-BES-04). */
  status?: "cutting";
}

function ErrorBox({ error }: { error: ApiError }) {
  const conflict = nameConflict(error);
  return (
    <div role="alert" className="warning">
      <p>{error.text}</p>
      {conflict && (
        <>
          {conflict.existing.map((v) => (
            <p key={v.id}>Schon vorhanden: {v.name}</p>
          ))}
          <p>Mit einem Kennzeichen heißt das neue Exemplar dann „{conflict.name} – Kennzeichen“.</p>
        </>
      )}
    </div>
  );
}

function Fields(props: {
  name: string;
  marker: string;
  onMarker: (k: string) => void;
  locations: readonly LightLocation[];
}) {
  return (
    <>
      <p className="name-preview" aria-live="polite">
        Name: {props.name}
      </p>
      <label>
        Kennzeichen (optional)
        <input
          name="marker"
          value={props.marker}
          maxLength={40}
          autoComplete="off"
          placeholder="zum Beispiel rot"
          onChange={(e) => props.onMarker(e.target.value)}
        />
      </label>
      <p className="quiet">
        Nur nötig, wenn du schon ein Exemplar dieser Art hast: Dann unterscheidet das Kennzeichen
        die Töpfe.
      </p>
      <label className="check">
        <input type="checkbox" name="cutting" />
        Das ist ein Steckling
      </label>
      <p className="quiet">
        Ein Steckling steht unter Stecklingslicht und fehlt in den Phasen und in der
        Lichtverteilung. Wenn du ihn eintopfst, tippe auf der Karte „Eingetopft“.
      </p>
      <label>
        Standort
        <select name="locationId" defaultValue="">
          <option value="">Standort noch unbekannt</option>
          {props.locations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <p className="quiet">
        Ohne Auswahl bleibt der Standort unbekannt. Gefangen am: heute (nach deinem lokalen Datum).
      </p>
    </>
  );
}

/**
 * Create specimen (US-BES-02): only the species is required. The name is fixed before saving and is already shown
 * here (DM-BES-03). The location is unknown until the keeper chooses one, since a target location is supplied only by the
 * care phase (PHA); none of it is invented (P-08).
 */
export function CreateForm(props: {
  species: Species;
  locations: readonly LightLocation[];
  onSend: (input: CreateInput) => Promise<ApiError | null>;
  onCancel: () => void;
  errorStart?: ApiError;
}) {
  const [marker, setMarker] = useState("");
  const [error, setError] = useState<ApiError | null>(props.errorStart ?? null);
  const [running, setRunning] = useState(false);
  const name = specimenName(speciesDisplayName(props.species), marker.trim() || null);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const locationId = String(f.get("locationId") ?? "");
    const cutting = f.get("cutting") !== null;
    setRunning(true);
    setError(
      await props.onSend({
        ...(marker.trim() ? { marker: marker.trim() } : {}),
        ...(locationId ? { locationId } : {}),
        ...(cutting ? { status: "cutting" as const } : {}),
      }),
    );
    setRunning(false);
  }
  return (
    <section aria-labelledby="create-title">
      <h1 id="create-title">Exemplar anlegen</h1>
      <p className="lead">
        Art: <i>{props.species.latinName}</i>
        {props.species.germanName ? ` (${props.species.germanName})` : ""}
      </p>
      <form className="form" onSubmit={(e) => void send(e)} aria-label="Exemplar anlegen">
        <Fields
          name={name}
          marker={marker}
          onMarker={(k) => {
            setMarker(k);
            setError(null);
          }}
          locations={props.locations}
        />
        {error && <ErrorBox error={error} />}
        <div className="actions">
          <button type="submit" className="primary" disabled={running}>
            Exemplar anlegen
          </button>
          <button type="button" className="secondary" onClick={props.onCancel}>
            Zurück zur Art
          </button>
        </div>
      </form>
    </section>
  );
}
