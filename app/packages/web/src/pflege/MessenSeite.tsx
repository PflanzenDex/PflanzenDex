import "./pflege.css";
import { useCallback, useEffect, useState } from "react";
import type { MessAnsicht } from "@pflanzendex/core";
import { LadeFehler, type ApiFehler } from "../kern";
import { MessenFormular } from "./messen-formular";
import { MessungListe } from "./messung-liste";
import { erfasseMessung, ladeMessAnsicht, type MessungEingabe } from "./messungen-api";
import { MessKopf } from "./mess-kopf";
import { messungText } from "./text";

type Token = () => Promise<string | undefined>;
const ANMELDEN: ApiFehler = { code: "zugriff.nicht_angemeldet", text: "Bitte melde dich neu an." };
type Daten =
  { art: "laedt" } | { art: "fehler"; fehler: ApiFehler } | { art: "da"; ansicht: MessAnsicht };

async function ladeDaten(api: string, token: Token, exemplarId: string): Promise<Daten> {
  const t = await token();
  if (!t) return { art: "fehler", fehler: ANMELDEN };
  const r = await ladeMessAnsicht(api, t, exemplarId);
  return r.ok ? { art: "da", ansicht: r.wert } : { art: "fehler", fehler: r.fehler };
}

function useAnsicht(api: string, token: Token, exemplarId: string, neuLaden: number) {
  const [daten, setDaten] = useState<Daten>({ art: "laedt" });
  useEffect(() => {
    let aktuell = true;
    void ladeDaten(api, token, exemplarId).then((d) => aktuell && setDaten(d));
    return () => {
      aktuell = false;
    };
  }, [api, token, exemplarId, neuLaden]);
  return daten;
}

/**
 * Messen (US-WAC-01): Was messen, letzte Messung, letzte Bewertung, Eingabeformular und Verlauf eines Exemplars.
 * Rate und Trend fehlen noch (US-WAC-03). Jede Ansicht sagt, was als Nächstes zu tun ist (P-09).
 */
export function MessenSeite(props: {
  api: string;
  token: Token;
  exemplar: { id: string; name: string };
  onZurueck: () => void;
}) {
  const { api, token, exemplar } = props;
  const [neuLaden, setNeuLaden] = useState(0);
  const [gespeichert, setGespeichert] = useState<string | null>(null);
  const daten = useAnsicht(api, token, exemplar.id, neuLaden);
  const senden = useCallback(
    async (eingabe: MessungEingabe): Promise<ApiFehler | null> => {
      const t = await token();
      if (!t) return ANMELDEN;
      const r = await erfasseMessung({ api, token: t }, exemplar.id, eingabe);
      if (!r.ok) return r.fehler;
      setGespeichert(messungText(r.wert));
      setNeuLaden((n) => n + 1);
      return null;
    },
    [api, token, exemplar.id],
  );
  return (
    <div className="licht messen">
      <section aria-labelledby="messen-titel">
        <h1 id="messen-titel">Messen: {exemplar.name}</h1>
        {daten.art === "laedt" && <p role="status">Messungen werden geladen …</p>}
        {daten.art === "fehler" && (
          <LadeFehler fehler={daten.fehler} onNeuLaden={() => setNeuLaden((n) => n + 1)} />
        )}
        {daten.art === "da" && (
          <>
            <MessKopf ansicht={daten.ansicht} />
            {gespeichert && (
              <p role="status" className="hinweis">
                Gespeichert: {gespeichert}.
              </p>
            )}
            <MessenFormular einheit="cm" onSenden={senden} />
            <MessungListe messungen={daten.ansicht.messungen} />
          </>
        )}
        <div className="aktionen">
          <button type="button" className="sekundaer" onClick={props.onZurueck}>
            Zurück zum Bestand
          </button>
        </div>
      </section>
    </div>
  );
}
