import { useState, type FormEvent } from "react";
import type { ApiError, LightZone } from "./light-api";
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

/** Form for creating and changing a zone; fields stay in place on an error. */
export function ZoneForm(props: { start?: LightZone; onSave: Save; onCancel?: () => void }) {
  const z = props.start;
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setRunning(true);
    const f2 = await props.onSave({
      name: String(f.get("name") ?? ""),
      luxCeiling: Number(f.get("luxCeiling")),
      ppfd: numberOrNull(String(f.get("ppfd") ?? "")),
      sortOrder: numberOrNull(String(f.get("sortOrder") ?? "")),
    });
    setRunning(false);
    setError(f2);
    if (!f2 && !z) form.reset();
  }
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
      <label>
        Lux-Decke (Lux)
        <input
          name="luxCeiling"
          type="number"
          inputMode="numeric"
          min={1}
          max={200000}
          step={1}
          required
          defaultValue={z?.luxCeiling ?? ""}
        />
      </label>
      <label>
        PPFD, optional (µmol/m²/s)
        <input
          name="ppfd"
          type="number"
          inputMode="numeric"
          min={1}
          max={3000}
          step={1}
          defaultValue={z?.ppfd ?? ""}
        />
      </label>
      <label>
        Reihenfolge, optional
        <input
          name="sortOrder"
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          step={1}
          defaultValue={z?.sortOrder ?? ""}
        />
      </label>
      {error && <ErrorMessage error={error} />}
      <div className="actions">
        <button type="submit" className="primary" disabled={running}>
          {z ? "Speichern" : "Zone anlegen"}
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
        <div className="actions">
          <button
            type="button"
            className="danger"
            onClick={() =>
              void props.onDelete().then((f) => {
                setError(f);
                if (f) setMode("zeigen");
              })
            }
          >
            Ja, „{zone.name}“ löschen
          </button>
          <button type="button" className="secondary" onClick={() => setMode("zeigen")}>
            Abbrechen
          </button>
        </div>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setError(null);
              setMode("update");
            }}
          >
            Ändern
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setError(null);
              setMode("remove");
            }}
          >
            Löschen
          </button>
        </div>
      )}
    </li>
  );
}
