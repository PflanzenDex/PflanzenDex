import { useState, type FormEvent } from "react";
import type { ApiFehler } from "./licht-api";

/** Sendet ein Formular: liest die Felder, wartet auf die API und behält die Eingaben bei einem Fehler. */
export function useSenden<E>(
  lies: (f: FormData) => E,
  speichern: (e: E) => Promise<ApiFehler | null>,
  leeren: boolean,
) {
  const [fehler, setFehler] = useState<ApiFehler | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  async function senden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLaeuft(true);
    const fehlerNeu = await speichern(lies(new FormData(form)));
    setLaeuft(false);
    setFehler(fehlerNeu);
    if (!fehlerNeu && leeren) form.reset();
  }
  return { fehler, laeuft, senden };
}

export function FormularKnoepfe(props: {
  beschriftung: string;
  laeuft: boolean;
  onAbbrechen?: (() => void) | undefined;
}) {
  return (
    <div className="aktionen">
      <button type="submit" className="primaer" disabled={props.laeuft}>
        {props.beschriftung}
      </button>
      {props.onAbbrechen && (
        <button type="button" className="sekundaer" onClick={props.onAbbrechen}>
          Abbrechen
        </button>
      )}
    </div>
  );
}
