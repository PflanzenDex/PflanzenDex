import { useState, type FormEvent } from "react";
import { localToday, MEASUREMENT_LIMITS } from "@pflanzendex/core";
import type { ApiError } from "../kernel";
import { checkInput } from "./input";
import type { MeasurementInput } from "./measurements-api";
import { QUALITY_NAME } from "./text";

function Fields({ unit, today }: { unit: string; today: string }) {
  return (
    <>
      <label>
        Messwert ({unit}, in Schritten von 0,5)
        <input
          name="value"
          inputMode="decimal"
          autoComplete="off"
          required
          placeholder="zum Beispiel 12,5"
        />
      </label>
      <label>
        Datum
        <input name="date" type="date" defaultValue={today} max={today} required />
      </label>
      <label>
        Qualität
        <select name="quality" defaultValue="healthy">
          {Object.entries(QUALITY_NAME).map(([id, text]) => (
            <option key={id} value={id}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notiz (optional)
        <textarea name="note" rows={2} maxLength={MEASUREMENT_LIMITS.note.max} />
      </label>
      <p className="quiet">Ein Foto kannst du hier noch nicht hinzufügen.</p>
    </>
  );
}

/**
 * Input of a measurement (US-WAC-01): number in steps of 0.5 cm, quality (preset healthy), optional note. The date is
 * today according to the local date of the device and can be changed (back-filling); the future is blocked. The photo
 * is still missing (media processing), the form says so openly.
 */
export function MeasureForm(props: {
  unit: string;
  onSend: (input: MeasurementInput) => Promise<ApiError | null>;
}) {
  const today = localToday(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const text = (name: string) => String(f.get(name) ?? "");
    const reviewed = checkInput({
      value: text("value"),
      date: text("date"),
      quality: text("quality"),
      note: text("note"),
    });
    if (!reviewed.ok) return setError(reviewed.text);
    setRunning(true);
    const r = await props.onSend(reviewed.input);
    setRunning(false);
    setError(r ? r.text : null);
    if (!r) form.reset();
  }
  return (
    <form className="form" onSubmit={(e) => void send(e)} aria-label="Messung erfassen" noValidate>
      <Fields unit={props.unit} today={today} />
      {error && (
        <div role="alert" className="warning">
          <p>{error}</p>
        </div>
      )}
      <div className="actions">
        <button type="submit" className="primary" disabled={running}>
          Messung speichern
        </button>
      </div>
    </form>
  );
}
