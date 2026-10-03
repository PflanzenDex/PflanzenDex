import { useState } from "react";
import type { ApiFehler, Lichtzone } from "./licht-api";
import { FormularKnoepfe, useSenden } from "./formular";
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

function ZahlFeld(props: {
  beschriftung: string;
  name: string;
  grenzen: readonly [number, number];
  wert: number | null | undefined;
  pflicht?: boolean;
}) {
  return (
    <label>
      {props.beschriftung}
      <input
        name={props.name}
        type="number"
        inputMode="numeric"
        min={props.grenzen[0]}
        max={props.grenzen[1]}
        step={1}
        required={props.pflicht ?? false}
        defaultValue={props.wert ?? ""}
      />
    </label>
  );
}

/** Formular zum Anlegen und Ändern einer Zone; Felder bleiben bei einem Fehler stehen. */
export function ZonenFormular(props: {
  start?: Lichtzone;
  onSpeichern: Speichern;
  onAbbrechen?: () => void;
}) {
  const z = props.start;
  const { fehler, laeuft, senden } = useSenden<ZonenEingabe>(
    (f) => ({
      name: String(f.get("name") ?? ""),
      luxDecke: Number(f.get("luxDecke")),
      ppfd: zahlOderNull(String(f.get("ppfd") ?? "")),
      reihenfolge: zahlOderNull(String(f.get("reihenfolge") ?? "")),
    }),
    props.onSpeichern,
    !z,
  );
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
      <ZahlFeld
        beschriftung="Lux-Decke (Lux)"
        name="luxDecke"
        grenzen={[1, 200000]}
        wert={z?.luxDecke}
        pflicht
      />
      <ZahlFeld
        beschriftung="PPFD, optional (µmol/m²/s)"
        name="ppfd"
        grenzen={[1, 3000]}
        wert={z?.ppfd}
      />
      <ZahlFeld
        beschriftung="Reihenfolge, optional"
        name="reihenfolge"
        grenzen={[0, 999]}
        wert={z?.reihenfolge}
      />
      {fehler && <FehlerMeldung fehler={fehler} />}
      <FormularKnoepfe
        beschriftung={z ? "Speichern" : "Zone anlegen"}
        laeuft={laeuft}
        onAbbrechen={props.onAbbrechen}
      />
    </form>
  );
}

function LoeschenBestaetigen(props: {
  name: string;
  onLoeschen: () => void;
  onAbbrechen: () => void;
}) {
  return (
    <div className="aktionen">
      <button type="button" className="gefahr" onClick={props.onLoeschen}>
        Ja, „{props.name}“ löschen
      </button>
      <button type="button" className="sekundaer" onClick={props.onAbbrechen}>
        Abbrechen
      </button>
    </div>
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
        <LoeschenBestaetigen
          name={zone.name}
          onLoeschen={() =>
            void props.onLoeschen().then((f) => {
              setFehler(f);
              if (f) setModus("zeigen");
            })
          }
          onAbbrechen={() => setModus("zeigen")}
        />
      ) : (
        <div className="aktionen">
          {(["aendern", "loeschen"] as const).map((ziel) => (
            <button
              key={ziel}
              type="button"
              className="sekundaer"
              onClick={() => {
                setFehler(null);
                setModus(ziel);
              }}
            >
              {ziel === "aendern" ? "Ändern" : "Löschen"}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
