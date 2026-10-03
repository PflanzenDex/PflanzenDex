import { useState, type FormEvent } from "react";
import { artAnzeigename, exemplarName, type Art, type LichtStandort } from "@pflanzendex/core";
import type { ApiFehler } from "../kern";
import { namenskonflikt } from "./text";

export interface AnlegenEingabe {
  kennzeichen?: string;
  standortId?: string;
  /** Nur „steckling“ wird gesendet; ohne Angabe ist das Exemplar eine Pflanze (US-BES-04). */
  status?: "steckling";
}

function Fehlerbox({ fehler }: { fehler: ApiFehler }) {
  const konflikt = namenskonflikt(fehler);
  return (
    <div role="alert" className="warnung">
      <p>{fehler.text}</p>
      {konflikt && (
        <>
          {konflikt.vorhandene.map((v) => (
            <p key={v.id}>Schon vorhanden: {v.name}</p>
          ))}
          <p>Mit einem Kennzeichen heißt das neue Exemplar dann „{konflikt.name} – Kennzeichen“.</p>
        </>
      )}
    </div>
  );
}

function Felder(props: {
  name: string;
  kennzeichen: string;
  onKennzeichen: (k: string) => void;
  standorte: readonly LichtStandort[];
}) {
  return (
    <>
      <p className="namensvorschau" aria-live="polite">
        Name: {props.name}
      </p>
      <label>
        Kennzeichen (optional)
        <input
          name="kennzeichen"
          value={props.kennzeichen}
          maxLength={40}
          autoComplete="off"
          placeholder="zum Beispiel rot"
          onChange={(e) => props.onKennzeichen(e.target.value)}
        />
      </label>
      <p className="leise">
        Nur nötig, wenn du schon ein Exemplar dieser Art hast: Dann unterscheidet das Kennzeichen
        die Töpfe.
      </p>
      <label className="haken">
        <input type="checkbox" name="steckling" />
        Das ist ein Steckling
      </label>
      <p className="leise">
        Ein Steckling steht unter Stecklingslicht und fehlt in den Phasen und in der
        Lichtverteilung. Wenn du ihn eintopfst, tippe auf der Karte „Eingetopft“.
      </p>
      <label>
        Standort
        <select name="standortId" defaultValue="">
          <option value="">Standort noch unbekannt</option>
          {props.standorte.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <p className="leise">
        Ohne Auswahl bleibt der Standort unbekannt. Gefangen am: heute (nach deinem lokalen Datum).
      </p>
    </>
  );
}

/**
 * Exemplar anlegen (US-BES-02): Pflicht ist nur die Art. Der Name steht vor dem Speichern fest und wird hier schon
 * gezeigt (DM-BES-03). Der Standort ist unbekannt, bis der Halter einen wählt, denn einen Soll-Standort liefert erst die
 * Pflegephase (PHA); nichts davon wird erfunden (P-08).
 */
export function AnlegenFormular(props: {
  art: Art;
  standorte: readonly LichtStandort[];
  onSenden: (eingabe: AnlegenEingabe) => Promise<ApiFehler | null>;
  onAbbrechen: () => void;
  fehlerStart?: ApiFehler;
}) {
  const [kennzeichen, setKennzeichen] = useState("");
  const [fehler, setFehler] = useState<ApiFehler | null>(props.fehlerStart ?? null);
  const [laeuft, setLaeuft] = useState(false);
  const name = exemplarName(artAnzeigename(props.art), kennzeichen.trim() || null);
  async function senden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const standortId = String(f.get("standortId") ?? "");
    const steckling = f.get("steckling") !== null;
    setLaeuft(true);
    setFehler(
      await props.onSenden({
        ...(kennzeichen.trim() ? { kennzeichen: kennzeichen.trim() } : {}),
        ...(standortId ? { standortId } : {}),
        ...(steckling ? { status: "steckling" as const } : {}),
      }),
    );
    setLaeuft(false);
  }
  return (
    <section aria-labelledby="anlegen-titel">
      <h1 id="anlegen-titel">Exemplar anlegen</h1>
      <p className="lead">
        Art: <i>{props.art.lateinischerName}</i>
        {props.art.deutscherName ? ` (${props.art.deutscherName})` : ""}
      </p>
      <form className="formular" onSubmit={(e) => void senden(e)} aria-label="Exemplar anlegen">
        <Felder
          name={name}
          kennzeichen={kennzeichen}
          onKennzeichen={(k) => {
            setKennzeichen(k);
            setFehler(null);
          }}
          standorte={props.standorte}
        />
        {fehler && <Fehlerbox fehler={fehler} />}
        <div className="aktionen">
          <button type="submit" className="primaer" disabled={laeuft}>
            Exemplar anlegen
          </button>
          <button type="button" className="sekundaer" onClick={props.onAbbrechen}>
            Zurück zur Art
          </button>
        </div>
      </form>
    </section>
  );
}
