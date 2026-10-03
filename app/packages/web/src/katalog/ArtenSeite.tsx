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
 * Art im Katalog suchen, ansehen, wählen oder vorschlagen (US-BES-01). „Wählen“ meldet die Art nach außen; das
 * Exemplar dazu legt `bestand` an (US-BES-02), die App verdrahtet beide (`katalog` kennt `bestand` nicht).
 */
export function ArtenSeite(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onWaehlen: (art: Art) => void;
}) {
  const { api, token, onWaehlen } = props;
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: "suche" });
  const [suchtext, setSuchtext] = useState("");
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
        <ProfilSeite profil={profil} neu={neu} onWaehlen={onWaehlen} onZurueck={zurueck} />
      )}
    </div>
  );
}
