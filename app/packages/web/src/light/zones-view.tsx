import { useState } from "react";
import type { ApiError, LightZone } from "./light-api";
import { FormButtons, useSend } from "./form";
import { ErrorMessage } from "./message";
import { lux, ppfd } from "./text";

export interface ZoneInput {
  name: string;
  luxCeiling: number;
  ppfd: number | null;
  sortOrder: number | null;
}

type Save = (e: ZoneInput) => Promise<ApiError | null>;

const numberOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

function NumberField(props: {
  label: string;
  name: string;
  limits: readonly [number, number];
  value: number | null | undefined;
  required?: boolean;
}) {
  return (
    <label>
      {props.label}
      <input
        name={props.name}
        type="number"
        inputMode="numeric"
        min={props.limits[0]}
        max={props.limits[1]}
        step={1}
        required={props.required ?? false}
        defaultValue={props.value ?? ""}
      />
    </label>
  );
}

/** Form for creating and changing a zone; fields stay in place on an error. */
export function ZoneForm(props: { start?: LightZone; onSave: Save; onCancel?: () => void }) {
  const z = props.start;
  const { error, running, send } = useSend<ZoneInput>(
    (f) => ({
      name: String(f.get("name") ?? ""),
      luxCeiling: Number(f.get("luxCeiling")),
      ppfd: numberOrNull(String(f.get("ppfd") ?? "")),
      sortOrder: numberOrNull(String(f.get("sortOrder") ?? "")),
    }),
    props.onSave,
    !z,
  );
  return (
    <form
      className="form"
      onSubmit={(e) => void send(e)}
      aria-label={z ? `${z.name} ändern` : "Lichtzone anlegen"}
    >
      <label>
        Name
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={z?.name ?? ""}
          autoComplete="off"
        />
      </label>
      <NumberField
        label="Lux-Decke (Lux)"
        name="luxCeiling"
        limits={[1, 200000]}
        value={z?.luxCeiling}
        required
      />
      <NumberField
        label="PPFD, optional (µmol/m²/s)"
        name="ppfd"
        limits={[1, 3000]}
        value={z?.ppfd}
      />
      <NumberField
        label="Reihenfolge, optional"
        name="sortOrder"
        limits={[0, 999]}
        value={z?.sortOrder}
      />
      {error && <ErrorMessage error={error} />}
      <FormButtons
        label={z ? "Speichern" : "Zone anlegen"}
        running={running}
        onCancel={props.onCancel}
      />
    </form>
  );
}

function DeleteConfirm(props: { name: string; onDelete: () => void; onCancel: () => void }) {
  return (
    <div className="actions">
      <button type="button" className="danger" onClick={props.onDelete}>
        Ja, „{props.name}“ löschen
      </button>
      <button type="button" className="secondary" onClick={props.onCancel}>
        Abbrechen
      </button>
    </div>
  );
}

export function ZoneCard(props: {
  zone: LightZone;
  onUpdate: Save;
  onDelete: () => Promise<ApiError | null>;
}) {
  const { zone } = props;
  const [mode, setMode] = useState<"zeigen" | "update" | "remove">("zeigen");
  const [error, setError] = useState<ApiError | null>(null);
  if (mode === "update")
    return (
      <li className="entry">
        <ZoneForm
          start={zone}
          onCancel={() => setMode("zeigen")}
          onSave={async (e) => {
            const f = await props.onUpdate(e);
            if (!f) setMode("zeigen");
            return f;
          }}
        />
      </li>
    );
  return (
    <li className="entry">
      <h3>{zone.name}</h3>
      <p className="quiet">
        bis {lux(zone.luxCeiling)} · {ppfd(zone.ppfd)} · Platz {zone.sortOrder}
      </p>
      {error && <ErrorMessage error={error} />}
      {mode === "remove" ? (
        <DeleteConfirm
          name={zone.name}
          onDelete={() =>
            void props.onDelete().then((f) => {
              setError(f);
              if (f) setMode("zeigen");
            })
          }
          onCancel={() => setMode("zeigen")}
        />
      ) : (
        <div className="actions">
          {(["update", "remove"] as const).map((target) => (
            <button
              key={target}
              type="button"
              className="secondary"
              onClick={() => {
                setError(null);
                setMode(target);
              }}
            >
              {target === "update" ? "Ändern" : "Löschen"}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
