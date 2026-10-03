import { useState, type FormEvent } from "react";
import type { ApiFehler, Lichtzone } from "./licht-api";
import { FehlerMeldung } from "./meldung";
import { lux, ppfd } from "./text";

export interface ZonenEingabe {
  name: string;
  luxDecke: number;
  ppfd: number | null;
  reihenfolge: number | null;
}

type Speichern = (e: ZonenEingabe) => Promise<ApiFehler | null>;

const zahlOderNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

/** Formular zum Anlegen und Ändern einer Zone; Felder bleiben bei einem Fehler stehen. */
export function ZonenFormular(props: {
  start?: Lichtzone;
  onSpeichern: Speichern;
  onAbbrechen?: () => void;
}) {
  const z = props.start;
  const [fehler, setFehler] = useState<ApiFehler | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  async function senden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setLaeuft(true);
    const f2 = await props.onSpeichern({
      name: String(f.get("name") ?? ""),
      luxDecke: Number(f.get("luxDecke")),
      ppfd: zahlOderNull(String(f.get("ppfd") ?? "")),
      reihenfolge: zahlOderNull(String(f.get("reihenfolge") ?? "")),
    });
    setLaeuft(false);
    setFehler(f2);
    if (!f2 && !z) form.reset();
  }
  return (
    <form
      className="formular"
      onSubmit={(e) => void senden(e)}
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
          name="luxDecke"
          type="number"
          inputMode="numeric"
          min={1}
          max={200000}
          step={1}
          required
          defaultValue={z?.luxDecke ?? ""}
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
          name="reihenfolge"
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          step={1}
          defaultValue={z?.reihenfolge ?? ""}
        />
      </label>
      {fehler && <FehlerMeldung fehler={fehler} />}
      <div className="aktionen">
        <button type="submit" className="primaer" disabled={laeuft}>
          {z ? "Speichern" : "Zone anlegen"}
        </button>
        {props.onAbbrechen && (
          <button type="button" className="sekundaer" onClick={props.onAbbrechen}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}

export function ZonenKarte(props: {
  zone: Lichtzone;
  onAendern: Speichern;
  onLoeschen: () => Promise<ApiFehler | null>;
}) {
  const { zone } = props;
  const [modus, setModus] = useState<"zeigen" | "aendern" | "loeschen">("zeigen");
  const [fehler, setFehler] = useState<ApiFehler | null>(null);
  if (modus === "aendern")
    return (
      <li className="eintrag">
        <ZonenFormular
          start={zone}
          onAbbrechen={() => setModus("zeigen")}
          onSpeichern={async (e) => {
            const f = await props.onAendern(e);
            if (!f) setModus("zeigen");
            return f;
          }}
        />
      </li>
    );
  return (
    <li className="eintrag">
      <h3>{zone.name}</h3>
      <p className="leise">
        bis {lux(zone.luxDecke)} · {ppfd(zone.ppfd)} · Platz {zone.reihenfolge}
      </p>
      {fehler && <FehlerMeldung fehler={fehler} />}
      {modus === "loeschen" ? (
        <div className="aktionen">
          <button
            type="button"
            className="gefahr"
            onClick={() =>
              void props.onLoeschen().then((f) => {
                setFehler(f);
                if (f) setModus("zeigen");
              })
            }
          >
            Ja, „{zone.name}“ löschen
          </button>
          <button type="button" className="sekundaer" onClick={() => setModus("zeigen")}>
            Abbrechen
          </button>
        </div>
      ) : (
        <div className="aktionen">
          <button
            type="button"
            className="sekundaer"
            onClick={() => {
              setFehler(null);
              setModus("aendern");
            }}
          >
            Ändern
          </button>
          <button
            type="button"
            className="sekundaer"
            onClick={() => {
              setFehler(null);
              setModus("loeschen");
            }}
          >
            Löschen
          </button>
        </div>
      )}
    </li>
  );
}
