import { useState } from "react";
import type { ApiError, LightLocation, LightZone } from "./light-api";
import { FormButtons, useSend } from "./form";
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
  const { error, running, send } = useSend<LocationInput>(
    (f) => ({
      name: String(f.get("name") ?? ""),
      lightZoneId: String(f.get("lightZoneId") ?? "") || null,
      kind: f.get("kind") === "outdoor" ? "outdoor" : "indoor",
    }),
    props.onSave,
    !s,
  );
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
      <FormButtons
        label={s ? "Speichern" : "Standort anlegen"}
        running={running}
        onCancel={props.onCancel}
      />
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
