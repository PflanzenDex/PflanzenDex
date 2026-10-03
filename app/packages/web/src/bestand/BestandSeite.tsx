import "./bestand.css";
import { useCallback, useEffect, useState } from "react";
import type { Art, Exemplar, LichtStandort } from "@pflanzendex/core";
import { ladeStandorte } from "../licht";
import type { ApiFehler } from "../kern";
import { AnlegenFormular, type AnlegenEingabe } from "./anlegen-formular";
import { BestandListe } from "./bestand-liste";
import { ladeExemplare, legeExemplarAn } from "./exemplare-api";

type Token = () => Promise<string | undefined>;
const ANMELDEN: ApiFehler = { code: "zugriff.nicht_angemeldet", text: "Bitte melde dich neu an." };
type Daten =
  | { art: "laedt" }
  | { art: "fehler"; fehler: ApiFehler }
  | { art: "da"; exemplare: readonly Exemplar[]; standorte: readonly LichtStandort[] };

/** Lädt Exemplare und Standorte; scheitert eines, scheitert das Laden als Ganzes (nichts halb anzeigen). */
function useBestand(api: string, token: Token, neuLaden: number) {
  const [daten, setDaten] = useState<Daten>({ art: "laedt" });
  useEffect(() => {
    let aktuell = true;
    void (async () => {
      const t = await token();
      if (!t) return aktuell && setDaten({ art: "fehler", fehler: ANMELDEN });
      const [e, s] = await Promise.all([ladeExemplare(api, t), ladeStandorte(api, t)]);
      if (!aktuell) return;
      if (!e.ok) return setDaten({ art: "fehler", fehler: e.fehler });
      if (!s.ok) return setDaten({ art: "fehler", fehler: s.fehler });
      setDaten({ art: "da", exemplare: e.wert, standorte: s.wert });
    })();
    return () => {
      aktuell = false;
    };
  }, [api, token, neuLaden]);
  return daten;
}

function Angelegt({ exemplar }: { exemplar: Exemplar }) {
  return (
    <p role="status" className="hinweis">
      Exemplar „{exemplar.name}“ ist angelegt.
      {exemplar.standortId === null &&
        " Der Standort ist unbekannt, denn ein Soll-Standort steht erst mit den Pflegephasen fest."}
    </p>
  );
}

/**
 * Bestand und Exemplar anlegen (US-BES-02). Mit einer gewählten Art zeigt die Seite das Formular, sonst die Liste.
 * Die Wahl der Art kommt aus dem Katalog (`katalog` kennt `bestand` nicht, die Verdrahtung macht die App).
 */
export function BestandSeite(props: {
  api: string;
  token: Token;
  neueArt: Art | null;
  onArtWaehlen: () => void;
  onAbgeschlossen: () => void;
  onMessen?: (e: Exemplar) => void;
}) {
  const { api, token, neueArt, onAbgeschlossen } = props;
  const [neuLaden, setNeuLaden] = useState(0);
  const [angelegt, setAngelegt] = useState<Exemplar | null>(null);
  const daten = useBestand(api, token, neuLaden);
  const senden = useCallback(
    async (eingabe: AnlegenEingabe): Promise<ApiFehler | null> => {
      const t = await token();
      if (!t || !neueArt) return ANMELDEN;
      const r = await legeExemplarAn(api, t, { artId: neueArt.id, ...eingabe });
      if (!r.ok) return r.fehler;
      setAngelegt(r.wert);
      setNeuLaden((n) => n + 1);
      onAbgeschlossen();
      return null;
    },
    [api, token, neueArt, onAbgeschlossen],
  );
  return (
    <div className="licht bestand">
      {daten.art === "laedt" && <p role="status">Bestand wird geladen …</p>}
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
      {daten.art === "da" && neueArt && (
        <AnlegenFormular
          art={neueArt}
          standorte={daten.standorte}
          onSenden={senden}
          onAbbrechen={props.onArtWaehlen}
        />
      )}
      {daten.art === "da" && !neueArt && (
        <>
          {angelegt && <Angelegt exemplar={angelegt} />}
          <BestandListe
            exemplare={daten.exemplare}
            standorte={daten.standorte}
            onArtWaehlen={props.onArtWaehlen}
            {...(props.onMessen ? { onMessen: props.onMessen } : {})}
          />
        </>
      )}
    </div>
  );
}
