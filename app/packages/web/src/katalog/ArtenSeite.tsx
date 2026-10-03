import "./arten.css";
import { useState } from "react";
import type { Art } from "@pflanzendex/core";
import type { ApiFehler } from "../kern";
import { schlageVor } from "./arten-api";
import { ANMELDEN, useProfil, useSuche, type Profil } from "./arten-hooks";
import { ArtProfil } from "./profil-ansicht";
import { ArtSuche } from "./suche-ansicht";
import { VorschlagFormular } from "./vorschlag-formular";

type Ansicht = { art: "suche" } | { art: "vorschlag" } | { art: "profil" };

function Gewaehlt({ art }: { art: Art }) {
  return (
    <p role="status" className="hinweis">
      Gewählt: <i>{art.lateinischerName}</i>. Das Exemplar dazu legst du an, sobald es diese
      Funktion gibt (US-BES-02).
    </p>
  );
}

function ProfilSeite(props: {
  profil: Profil;
  neu: boolean;
  onWaehlen: (a: Art) => void;
  onZurueck: () => void;
}) {
  const { profil } = props;
  return (
    <>
      {props.neu && (
        <p role="status" className="hinweis">
          Dein Vorschlag ist gespeichert und liegt in der Prüfliste.
        </p>
      )}
      {profil.art === "laedt" && <p role="status">Art wird geladen …</p>}
      {profil.art === "fehler" && (
        <p role="alert" className="warnung">
          {profil.fehler.text}
        </p>
      )}
      {profil.art === "da" ? (
        <ArtProfil
          art={profil.wert}
          onWaehlen={() => props.onWaehlen(profil.wert)}
          onZurueck={props.onZurueck}
        />
      ) : (
        <button type="button" className="sekundaer" onClick={props.onZurueck}>
          Zurück zur Suche
        </button>
      )}
    </>
  );
}

/**
 * Art im Katalog suchen, ansehen, wählen oder vorschlagen (US-BES-01). „Wählen“ merkt sich die Art; das Exemplar
 * dazu legt US-BES-02 an, das es noch nicht gibt (die Seite sagt das offen).
 */
export function ArtenSeite(props: { api: string; token: () => Promise<string | undefined> }) {
  const { api, token } = props;
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: "suche" });
  const [suchtext, setSuchtext] = useState("");
  const [gewaehlt, setGewaehlt] = useState<Art | null>(null);
  const [neu, setNeu] = useState(false);
  const suche = useSuche(api, token, suchtext, ansicht.art);
  const { profil, lade } = useProfil(api, token);

  const oeffne = (id: string) => {
    setAnsicht({ art: "profil" });
    void lade(id);
  };
  async function senden(eingabe: Record<string, unknown>): Promise<ApiFehler | null> {
    const t = await token();
    const r = t ? await schlageVor(api, t, eingabe) : { ok: false as const, fehler: ANMELDEN };
    if (!r.ok) return r.fehler;
    setNeu(true);
    oeffne(r.wert.id);
    return null;
  }
  const zurueck = () => {
    setNeu(false);
    setAnsicht({ art: "suche" });
  };
  return (
    <div className="licht arten">
      {gewaehlt && <Gewaehlt art={gewaehlt} />}
      {suche.fehler && ansicht.art === "suche" && (
        <p role="alert" className="warnung">
          {suche.fehler.text}
        </p>
      )}
      {ansicht.art === "suche" && (
        <ArtSuche
          suchtext={suchtext}
          treffer={suche.treffer}
          laedt={suche.laedt}
          onSuche={setSuchtext}
          onOeffnen={oeffne}
          onVorschlagen={() => setAnsicht({ art: "vorschlag" })}
        />
      )}
      {ansicht.art === "vorschlag" && (
        <VorschlagFormular
          start={suchtext}
          onSenden={senden}
          onAbbrechen={zurueck}
          onVorhandene={oeffne}
        />
      )}
      {ansicht.art === "profil" && (
        <ProfilSeite profil={profil} neu={neu} onWaehlen={setGewaehlt} onZurueck={zurueck} />
      )}
    </div>
  );
}
