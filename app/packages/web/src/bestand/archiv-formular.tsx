import { useState, type FormEvent } from "react";
import { ARCHIV_GRUENDE } from "@pflanzendex/core";
import type { ApiFehler } from "../kern";

const ANDERER = "anderer";
const GRUND_FEHLT: ApiFehler = {
  code: "eingabe.ungueltig",
  text: "Bitte nenne einen Grund, damit du später noch weißt, warum das Exemplar im Archiv ist.",
};

function GrundFelder(props: {
  wahl: string;
  frei: string;
  onWahl: (w: string) => void;
  onFrei: (f: string) => void;
}) {
  return (
    <>
      <label>
        Grund
        <select value={props.wahl} onChange={(e) => props.onWahl(e.target.value)}>
          {ARCHIV_GRUENDE.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value={ANDERER}>anderer Grund …</option>
        </select>
      </label>
      {props.wahl === ANDERER && (
        <label>
          Eigener Grund
          <input
            value={props.frei}
            maxLength={250}
            autoComplete="off"
            onChange={(e) => props.onFrei(e.target.value)}
          />
        </label>
      )}
    </>
  );
}

/**
 * Exemplar archivieren (US-BES-07): ein Grund aus der Liste oder ein eigener. Das Formular sagt vorab, was passiert
 * (P-09) und dass es sich zurückholen lässt (P-10).
 */
export function ArchivierenFormular(props: {
  name: string;
  onSenden: (grund: string) => Promise<ApiFehler | null>;
  onAbbrechen: () => void;
}) {
  const [wahl, setWahl] = useState<string>(ARCHIV_GRUENDE[0]);
  const [frei, setFrei] = useState("");
  const [fehler, setFehler] = useState<ApiFehler | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  async function senden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const grund = wahl === ANDERER ? frei.trim() : wahl;
    if (!grund) return setFehler(GRUND_FEHLT);
    setLaeuft(true);
    setFehler(await props.onSenden(grund));
    setLaeuft(false);
  }
  return (
    <section aria-labelledby="archivieren-titel">
      <h1 id="archivieren-titel">Exemplar archivieren</h1>
      <p className="lead">„{props.name}“ verschwindet aus der Liste und aus den Auswertungen.</p>
      <p className="leise">
        Die Historie bleibt erhalten. Im Archiv kannst du es jederzeit wiederherstellen.
      </p>
      <form className="formular" onSubmit={(e) => void senden(e)} aria-label="Exemplar archivieren">
        <GrundFelder wahl={wahl} frei={frei} onWahl={setWahl} onFrei={setFrei} />
        {fehler && (
          <div role="alert" className="warnung">
            <p>{fehler.text}</p>
          </div>
        )}
        <div className="aktionen">
          <button type="submit" className="primaer" disabled={laeuft}>
            Archivieren
          </button>
          <button type="button" className="sekundaer" onClick={props.onAbbrechen}>
            Abbrechen
          </button>
        </div>
      </form>
    </section>
  );
}
