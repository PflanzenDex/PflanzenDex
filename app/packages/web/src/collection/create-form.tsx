import { useState, type FormEvent } from "react";
import {
  speciesDisplayName,
  specimenName,
  type Species,
  type LightLocation,
} from "@pflanzendex/core";
import type { ApiError } from "../kernel";
import { collectInput, isError, type CreateInput } from "./create-input";
import { MarkerFields, markerRule, type Sibling } from "./marker-fields";
import { nameConflict } from "./text";

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

function OtherFields(props: { locations: readonly LightLocation[] }) {
  return (
    <>
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

function Buttons(props: { running: boolean; onCancel: () => void }) {
  return (
    <div className="actions">
      <button type="submit" className="primary" disabled={props.running}>
        Exemplar anlegen
      </button>
      <button type="button" className="secondary" onClick={props.onCancel}>
        Zurück zur Art
      </button>
    </div>
  );
}

function Heading({ species }: { species: Species }) {
  return (
    <>
      <h1 id="create-title">Exemplar anlegen</h1>
      <p className="lead">
        Art: <i>{species.latinName}</i>
        {species.germanName ? ` (${species.germanName})` : ""}
      </p>
    </>
  );
}

/**
 * Create specimen (US-BES-02, US-BES-03): only the species is required for the first specimen. The name is fixed
 * before saving and is already shown here (DM-BES-03). From the second specimen on the marker is required (preset
 * "Klammer"); from the third on the form asks for the markers that existing specimens still miss, before it saves.
 * The location is unknown until the keeper chooses one, since a target location is supplied only by the care phase
 * (PHA); none of it is invented (P-08).
 */
export function CreateForm(props: {
  species: Species;
  /** The active specimens of this species (from the cards). */
  siblings: readonly Sibling[];
  locations: readonly LightLocation[];
  onSend: (input: CreateInput) => Promise<ApiError | null>;
  onCancel: () => void;
  errorStart?: ApiError;
}) {
  const rule = markerRule(props.siblings);
  const [marker, setMarker] = useState(rule.required ? rule.preset : "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<ApiError | null>(props.errorStart ?? null);
  const [running, setRunning] = useState(false);
  const speciesName = speciesDisplayName(props.species);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = collectInput({ marker, answers, data: new FormData(e.currentTarget) }, rule);
    if (isError(input)) return setError(input);
    setRunning(true);
    setError(await props.onSend(input));
    setRunning(false);
  }
  return (
    <section aria-labelledby="create-title">
      <Heading species={props.species} />
      <form
        className="form"
        noValidate
        onSubmit={(e) => void send(e)}
        aria-label="Exemplar anlegen"
      >
        <p className="name-preview" aria-live="polite">
          Name: {specimenName(speciesName, marker.trim() || null)}
        </p>
        <MarkerFields
          speciesName={speciesName}
          required={rule.required}
          missing={rule.missing}
          marker={marker}
          onMarker={(k) => {
            setMarker(k);
            setError(null);
          }}
          answers={answers}
          onAnswer={(id, k) => {
            setAnswers({ ...answers, [id]: k });
            setError(null);
          }}
        />
        <OtherFields locations={props.locations} />
        {error && <ErrorBox error={error} />}
        <Buttons running={running} onCancel={props.onCancel} />
      </form>
    </section>
  );
}
