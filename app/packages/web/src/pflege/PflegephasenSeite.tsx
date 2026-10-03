import { useEffect, useState } from "react";
import type { LichtStandort, PhasenZeile } from "@pflanzendex/core";
import { ladeStandorte } from "../licht";
import type { ApiFehler } from "../kern";
import { PhasenListe } from "./phasen-liste";
import { ladePflegephasen } from "./pflegephasen-api";

type Token = () => Promise<string | undefined>;
const ANMELDEN: ApiFehler = { code: "zugriff.nicht_angemeldet", text: "Bitte melde dich neu an." };
type Daten =
  | { art: "laedt" }
  | { art: "fehler"; fehler: ApiFehler }
  | { art: "da"; zeilen: readonly PhasenZeile[]; standorte: readonly LichtStandort[] };

/** Pflegephasen (US-PHA-01): lädt Phasen und Standorte; scheitert eines, scheitert das Laden als Ganzes. */
export function PflegephasenSeite(props: { api: string; token: Token }) {
  const { api, token } = props;
  const [neuLaden, setNeuLaden] = useState(0);
  const [daten, setDaten] = useState<Daten>({ art: "laedt" });
  useEffect(() => {
    let aktuell = true;
    void (async () => {
      const t = await token();
      if (!t) return aktuell && setDaten({ art: "fehler", fehler: ANMELDEN });
      const [p, s] = await Promise.all([ladePflegephasen(api, t), ladeStandorte(api, t)]);
      if (!aktuell) return;
      if (!p.ok) return setDaten({ art: "fehler", fehler: p.fehler });
      if (!s.ok) return setDaten({ art: "fehler", fehler: s.fehler });
      setDaten({ art: "da", zeilen: p.wert, standorte: s.wert });
    })();
    return () => {
      aktuell = false;
    };
  }, [api, token, neuLaden]);
  return (
    <div className="licht bestand">
      {daten.art === "laedt" && <p role="status">Pflegephasen werden geladen …</p>}
      {daten.art === "fehler" && (
        <div role="alert" className="warnung">
          <p>{daten.fehler.text}</p>
          <div className="aktionen">
            <button type="button" className="sekundaer" onClick={() => setNeuLaden((n) => n + 1)}>
              Erneut laden
            </button>
          </div>
        </div>
      )}
      {daten.art === "da" && <PhasenListe zeilen={daten.zeilen} standorte={daten.standorte} />}
    </div>
  );
}
