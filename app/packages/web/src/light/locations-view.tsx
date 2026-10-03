import { useState, type FormEvent } from "react";
import type { ApiError, LightLocation, LightZone } from "./light-api";
import { ErrorMessage } from "./message";
import { kindText, zoneName } from "./text";

export interface LocationInput {
  name: string;
  lightZoneId: string | null;
  kind: "indoor" | "outdoor";
}

type Save = (e: LocationInput) => Promise<ApiError | null>;

export function LocationForm(props: {
  zones: readonly LightZone[];
  start?: LightLocation;
  onSave: Save;
  onCancel?: () => void;
}) {
  const s = props.start;
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setRunning(true);
    const errorNew = await props.onSave({
      name: String(f.get("name") ?? ""),
      lightZoneId: String(f.get("lightZoneId") ?? "") || null,
      kind: f.get("kind") === "outdoor" ? "outdoor" : "indoor",
    });
    setRunning(false);
    setError(errorNew);
    if (!errorNew && !s) form.reset();
  }
  return (
    <form
      className="form"
      onSubmit={(e) => void send(e)}
      aria-label={s ? `${s.name} ändern` : "Standort anlegen"}
    >
      <label>
        Name
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={s?.name ?? ""}
          autoComplete="off"
        />
      </label>
      <label>
        Lichtzone
        <select name="lightZoneId" defaultValue={s?.lightZoneId ?? ""}>
          <option value="">Keine Lichtzone (erscheint in den Hinweisen)</option>
          {props.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Art
        <select name="kind" defaultValue={s?.kind ?? "indoor"}>
          <option value="indoor">innen</option>
          <option value="outdoor">außen</option>
        </select>
      </label>
      {error && <ErrorMessage error={error} />}
      <div className="actions">
        <button type="submit" className="primary" disabled={running}>
          {s ? "Speichern" : "Standort anlegen"}
        </button>
        {props.onCancel && (
          <button type="button" className="secondary" onClick={props.onCancel}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}

export function LocationCard(props: {
  location: LightLocation;
  zones: readonly LightZone[];
  onUpdate: Save;
}) {
  const { location } = props;
  const [update, setUpdate] = useState(false);
  const zone = zoneName(props.zones, location.lightZoneId);
  if (update)
    return (
      <li className="entry">
        <LocationForm
          zones={props.zones}
          start={location}
          onCancel={() => setUpdate(false)}
          onSave={async (e) => {
            const f = await props.onUpdate(e);
            if (!f) setUpdate(false);
            return f;
          }}
        />
      </li>
    );
  return (
    <li className="entry">
      <h3>{location.name}</h3>
      <p className="quiet">
        {zone ?? "Keine Lichtzone"} · {kindText(location.kind)}
      </p>
      <div className="actions">
        <button type="button" className="secondary" onClick={() => setUpdate(true)}>
          {zone ? "Ändern" : "Lichtzone zuweisen"}
        </button>
      </div>
    </li>
  );
}
