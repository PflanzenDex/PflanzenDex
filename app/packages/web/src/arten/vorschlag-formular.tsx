import { useState, type FormEvent } from "react";
import type { ApiFehler } from "../licht/licht-api";
import { dublette, formularZuEingabe } from "./formular";
import { WeitereAngaben } from "./weitere-angaben";
import { Pflichtfelder } from "./pflichtfelder";
import { FELDER } from "./text";

function Fehlerbox(props: { fehler: ApiFehler; onVorhandene: (id: string) => void }) {
  const vorhandene = dublette(props.fehler);
  const felder = (props.fehler.details ?? []).map((d) => FELDER[d.feld] ?? d.feld);
  return (
    <div role="alert" className="warnung">
      <p>{props.fehler.text}</p>
      {felder.length > 0 && <p>Bitte prüfe: {felder.join(", ")}.</p>}
      {vorhandene && (
        <div className="aktionen">
          <button
            type="button"
            className="sekundaer"
            onClick={() => props.onVorhandene(vorhandene.id)}
          >
            Vorhandene Art ansehen: {vorhandene.lateinischerName}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Art vorschlagen, der Weg ohne KI (FR-KI-05): alle Pflichtfelder aus DM-BES-01 im Formular. Der Vorschlag ist nur
 * für den Ersteller sichtbar und kommt in die Prüfliste (FR-BES-11); die Oberfläche sagt das vorher.
 */
export function VorschlagFormular(props: {
  start?: string;
  onSenden: (eingabe: Record<string, unknown>) => Promise<ApiFehler | null>;
  onAbbrechen: () => void;
  onVorhandene: (id: string) => void;
}) {
  const [fehler, setFehler] = useState<ApiFehler | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  async function senden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(await props.onSenden(formularZuEingabe(new FormData(e.currentTarget))));
    setLaeuft(false);
  }
  return (
    <section aria-labelledby="vorschlag-titel">
      <h1 id="vorschlag-titel">Art vorschlagen</h1>
      <p className="hinweis">
        Dein Vorschlag ist zunächst nur für dich sichtbar und kommt in die Prüfliste. Erst nach der
        Freigabe sehen ihn alle und er zählt im Pokédex. Bis dahin kannst du die Art trotzdem für
        dich wählen.
      </p>
      <p className="leise">Pflichtfelder sind mit * markiert.</p>
      <form className="formular" onSubmit={(e) => void senden(e)} aria-label="Art vorschlagen">
        <Pflichtfelder start={props.start ?? ""} />
        <WeitereAngaben />
        {fehler && <Fehlerbox fehler={fehler} onVorhandene={props.onVorhandene} />}
        <div className="aktionen">
          <button type="submit" className="primaer" disabled={laeuft}>
            Vorschlag speichern
          </button>
          <button type="button" className="sekundaer" onClick={props.onAbbrechen}>
            Abbrechen
          </button>
        </div>
      </form>
    </section>
  );
}
