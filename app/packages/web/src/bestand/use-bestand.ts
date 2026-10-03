import { useEffect, useState } from "react";
import type { ArchivEintrag, ExemplarKarte, LichtStandort } from "@pflanzendex/core";
import { ladeStandorte } from "../licht";
import type { ApiFehler } from "../kern";
import { ladeArchiv } from "./archiv-api";
import { ladeKarten } from "./karten-api";

export type Token = () => Promise<string | undefined>;
export const ANMELDEN: ApiFehler = {
  code: "zugriff.nicht_angemeldet",
  text: "Bitte melde dich neu an.",
};
export type Daten =
  | { art: "laedt" }
  | { art: "fehler"; fehler: ApiFehler }
  | {
      art: "da";
      karten: readonly ExemplarKarte[];
      standorte: readonly LichtStandort[];
      archiv: readonly ArchivEintrag[];
    };

/** Lädt Karten, Standorte und Archiv; scheitert eines, scheitert das Laden als Ganzes (nichts halb anzeigen). */
export function useBestand(api: string, token: Token, neuLaden: number): Daten {
  const [daten, setDaten] = useState<Daten>({ art: "laedt" });
  useEffect(() => {
    let aktuell = true;
    void (async () => {
      const t = await token();
      if (!t) return aktuell && setDaten({ art: "fehler", fehler: ANMELDEN });
      const [e, s, a] = await Promise.all([
        ladeKarten(api, t),
        ladeStandorte(api, t),
        ladeArchiv(api, t),
      ]);
      if (!aktuell) return;
      if (!e.ok) return setDaten({ art: "fehler", fehler: e.fehler });
      if (!s.ok) return setDaten({ art: "fehler", fehler: s.fehler });
      if (!a.ok) return setDaten({ art: "fehler", fehler: a.fehler });
      setDaten({ art: "da", karten: e.wert, standorte: s.wert, archiv: a.wert });
    })();
    return () => {
      aktuell = false;
    };
  }, [api, token, neuLaden]);
  return daten;
}
