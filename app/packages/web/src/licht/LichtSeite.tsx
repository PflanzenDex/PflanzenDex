import "./licht.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LichtAnsicht, type LichtAktionen } from "./licht-ansicht";
import { erzeugeSchreiben, ladeLicht, type ApiFehler, type LichtDaten } from "./licht-api";

type Zustand =
  { art: "laedt" } | { art: "fehler"; fehler: ApiFehler } | { art: "bereit"; daten: LichtDaten };

/** Lädt die Daten und verbindet die Ansicht mit der API; nach jedem Schreiben wird neu geladen (nie geraten). */
export function LichtSeite(props: { api: string; token: () => Promise<string | undefined> }) {
  const [z, setZ] = useState<Zustand>({ art: "laedt" });
  const [letzterFehler, setLetzterFehler] = useState<ApiFehler | undefined>();
  const { api, token } = props;

  const lade = useCallback(async () => {
    const t = await token();
    if (!t)
      return setZ({
        art: "fehler",
        fehler: { code: "zugriff.nicht_angemeldet", text: "Bitte melde dich neu an." },
      });
    const r = await ladeLicht(api, t);
    setZ(r.ok ? { art: "bereit", daten: r.wert } : { art: "fehler", fehler: r.fehler });
  }, [api, token]);
  useEffect(() => void lade(), [lade]);

  const aktionen = useMemo<LichtAktionen>(() => {
    const schreibe = async (methode: "POST" | "PUT" | "DELETE", pfad: string, body?: unknown) => {
      const t = await token();
      if (!t) return { code: "zugriff.nicht_angemeldet", text: "Bitte melde dich neu an." };
      const r = await erzeugeSchreiben(api, t)(methode, pfad, body);
      if (!r.ok) return r.fehler;
      setLetzterFehler(undefined);
      await lade();
      return null;
    };
    return {
      zoneAnlegen: (e) => schreibe("POST", "/lichtzonen", e),
      zoneAendern: (id, e) => schreibe("PUT", `/lichtzonen/${id}`, e),
      zoneLoeschen: (id) => schreibe("DELETE", `/lichtzonen/${id}`),
      voreinstellung: async () => {
        const f = await schreibe("POST", "/lichtzonen/voreinstellung", {});
        setLetzterFehler(f ?? undefined);
        return f;
      },
      standortAnlegen: (e) => schreibe("POST", "/standorte", e),
      standortAendern: (id, e) => schreibe("PUT", `/standorte/${id}`, e),
    };
  }, [api, token, lade]);

  if (z.art === "laedt")
    return (
      <p role="status" aria-busy="true">
        Standorte und Lichtzonen werden geladen …
      </p>
    );
  if (z.art === "fehler")
    return (
      <div>
        <p role="alert" className="warnung">
          {z.fehler.text}
        </p>
        <div className="aktionen">
          <button type="button" className="primaer" onClick={() => void lade()}>
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  return (
    <LichtAnsicht
      daten={z.daten}
      aktionen={aktionen}
      {...(letzterFehler ? { fehler: letzterFehler } : {})}
    />
  );
}
