import "./bestand.css";
import { useCallback, useEffect, useState } from "react";
import type { Art, Exemplar, ExemplarKarte, LichtStandort, Verteilung } from "@pflanzendex/core";
import { ladeStandorte } from "../licht";
import { LadeFehler, type ApiFehler } from "../kern";
import { AnlegenFormular, type AnlegenEingabe } from "./anlegen-formular";
import { BestandListe } from "./bestand-liste";
import { legeExemplarAn } from "./exemplare-api";
import { ladeKarten } from "./karten-api";
import { ladeVerteilung } from "./verteilung-api";
import { VerteilungAnsicht } from "./verteilung-ansicht";

type Token = () => Promise<string | undefined>;
const ANMELDEN: ApiFehler = { code: "zugriff.nicht_angemeldet", text: "Bitte melde dich neu an." };
type Daten =
  | { art: "laedt" }
  | { art: "fehler"; fehler: ApiFehler }
  | {
      art: "da";
      karten: readonly ExemplarKarte[];
      standorte: readonly LichtStandort[];
      verteilung: Verteilung;
    };

/** Lädt Exemplare, Standorte und Verteilung; scheitert eines, scheitert das Laden als Ganzes (nichts halb anzeigen). */
function useBestand(api: string, token: Token, neuLaden: number) {
  const [daten, setDaten] = useState<Daten>({ art: "laedt" });
  useEffect(() => {
    let aktuell = true;
    void (async () => {
      const t = await token();
      if (!t) return aktuell && setDaten({ art: "fehler", fehler: ANMELDEN });
      const [e, s, v] = await Promise.all([
        ladeKarten(api, t),
        ladeStandorte(api, t),
        ladeVerteilung(api, t),
      ]);
      if (!aktuell) return;
      if (!e.ok) return setDaten({ art: "fehler", fehler: e.fehler });
      if (!s.ok) return setDaten({ art: "fehler", fehler: s.fehler });
      if (!v.ok) return setDaten({ art: "fehler", fehler: v.fehler });
      setDaten({ art: "da", karten: e.wert, standorte: s.wert, verteilung: v.wert });
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
  onMessen?: (e: { id: string; name: string }) => void;
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
        <LadeFehler fehler={daten.fehler} onNeuLaden={() => setNeuLaden((n) => n + 1)} />
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
          <VerteilungAnsicht verteilung={daten.verteilung} />
          <BestandListe
            karten={daten.karten}
            onArtWaehlen={props.onArtWaehlen}
            {...(props.onMessen ? { onMessen: props.onMessen } : {})}
          />
        </>
      )}
    </div>
  );
}
