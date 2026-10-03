import { useState, type FormEvent } from "react";
import type { AbleitungsAnfrage, Ableitung, Antwort } from "./licht-api";
import { FehlerMeldung } from "./meldung";
import { ableitungText } from "./text";

export type Ableiten = (a: AbleitungsAnfrage) => Promise<Antwort<Ableitung>>;

/** US-LIC-01: zeigt, welcher Zone deines Kontos eine Art nach ihrem Lux-Bedarf zugeordnet wird. */
export function AbleitungsFormular({ onAbleiten }: { onAbleiten: Ableiten }) {
  const [antwort, setAntwort] = useState<Antwort<Ableitung> | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  async function senden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLaeuft(true);
    setAntwort(
      await onAbleiten({
        lichtbedarfLux: Number(f.get("lichtbedarfLux")),
        standardStufe: Number(f.get("standardStufe")),
        weichesBlatt: f.get("weichesBlatt") === "on",
      }),
    );
    setLaeuft(false);
  }
  const text = antwort?.ok ? ableitungText(antwort.wert) : null;
  return (
    <form className="formular" onSubmit={(e) => void senden(e)} aria-label="Zone ermitteln">
      <label>
        Lux-Bedarf der Art (Lux)
        <input
          name="lichtbedarfLux"
          type="number"
          inputMode="numeric"
          min={1}
          max={200000}
          step={1}
          required
        />
      </label>
      <label>
        Standard-Stufe
        <select name="standardStufe" defaultValue="2">
          <option value="2">Stufe 2</option>
          <option value="3">Stufe 3</option>
          <option value="4">Stufe 4</option>
        </select>
      </label>
      <label className="auswahl">
        <input name="weichesBlatt" type="checkbox" />
        Sonnenliebende C3-Pflanze mit weichem Blatt
      </label>
      {antwort && !antwort.ok && <FehlerMeldung fehler={antwort.fehler} />}
      {text && (
        <div role="status" className="ergebnis">
          <p>
            <strong>{text.titel}</strong>
          </p>
          <p>{text.grund}</p>
        </div>
      )}
      <div className="aktionen">
        <button type="submit" className="primaer" disabled={laeuft}>
          Zone ermitteln
        </button>
      </div>
    </form>
  );
}
