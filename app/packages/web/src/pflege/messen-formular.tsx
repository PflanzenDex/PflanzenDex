import { useState, type FormEvent } from "react";
import { heuteLokal, MESSUNG_GRENZEN } from "@pflanzendex/core";
import type { ApiFehler } from "../kern";
import { pruefeEingabe } from "./eingabe";
import type { MessungEingabe } from "./messungen-api";
import { QUALITAET_NAME } from "./text";

function Felder({ einheit, heute }: { einheit: string; heute: string }) {
  return (
    <>
      <label>
        Messwert ({einheit}, in Schritten von 0,5)
        <input
          name="wert"
          inputMode="decimal"
          autoComplete="off"
          required
          placeholder="zum Beispiel 12,5"
        />
      </label>
      <label>
        Datum
        <input name="datum" type="date" defaultValue={heute} max={heute} required />
      </label>
      <label>
        Qualität
        <select name="qualitaet" defaultValue="gesund">
          {Object.entries(QUALITAET_NAME).map(([id, text]) => (
            <option key={id} value={id}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notiz (optional)
        <textarea name="notiz" rows={2} maxLength={MESSUNG_GRENZEN.notiz.max} />
      </label>
      <p className="leise">Ein Foto kannst du hier noch nicht hinzufügen.</p>
    </>
  );
}

/**
 * Eingabe einer Messung (US-WAC-01): Zahl in Schritten von 0,5 cm, Qualität (voreingestellt gesund), optionale Notiz.
 * Das Datum ist heute nach dem lokalen Datum des Geräts und änderbar (Nachtragen); die Zukunft ist gesperrt.
 * Das Foto fehlt noch (Medienverarbeitung), das Formular sagt es offen.
 */
export function MessenFormular(props: {
  einheit: string;
  onSenden: (eingabe: MessungEingabe) => Promise<ApiFehler | null>;
}) {
  const heute = heuteLokal(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  async function senden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formular = e.currentTarget;
    const f = new FormData(formular);
    const text = (name: string) => String(f.get(name) ?? "");
    const geprueft = pruefeEingabe({
      wert: text("wert"),
      datum: text("datum"),
      qualitaet: text("qualitaet"),
      notiz: text("notiz"),
    });
    if (!geprueft.ok) return setFehler(geprueft.text);
    setLaeuft(true);
    const r = await props.onSenden(geprueft.eingabe);
    setLaeuft(false);
    setFehler(r ? r.text : null);
    if (!r) formular.reset();
  }
  return (
    <form
      className="formular"
      onSubmit={(e) => void senden(e)}
      aria-label="Messung erfassen"
      noValidate
    >
      <Felder einheit={props.einheit} heute={heute} />
      {fehler && (
        <div role="alert" className="warnung">
          <p>{fehler}</p>
        </div>
      )}
      <div className="aktionen">
        <button type="submit" className="primaer" disabled={laeuft}>
          Messung speichern
        </button>
      </div>
    </form>
  );
}
