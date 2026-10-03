import { useCallback, useState } from "react";
import type { ApiFehler } from "../kern";
import { archiviere, stelleWiederHer } from "./archiv-api";
import { ANMELDEN, type Token } from "./use-bestand";

type Exemplarname = { id: string; name: string };

/**
 * Zustand und Aktionen für Archivieren und Wiederherstellen (US-BES-07). Nach Erfolg lädt die Seite neu (`danach`) und
 * die Meldung sagt, wo das Exemplar jetzt ist (P-09); ein Fehler bleibt sichtbar (P-10).
 */
export function useArchivieren(api: string, token: Token, danach: () => void) {
  const [offen, setOffen] = useState<Exemplarname | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<ApiFehler | null>(null);

  const archivieren = useCallback(
    async (grund: string): Promise<ApiFehler | null> => {
      const t = await token();
      if (!t || !offen) return ANMELDEN;
      const r = await archiviere(api, t, { id: offen.id, grund });
      if (!r.ok) return r.fehler;
      setMeldung(
        `„${offen.name}“ ist archiviert. Du findest es im Archiv und kannst es dort wiederherstellen.`,
      );
      setOffen(null);
      danach();
      return null;
    },
    [api, token, offen, danach],
  );

  const wiederherstellen = useCallback(
    async (e: Exemplarname) => {
      const t = await token();
      const r = t ? await stelleWiederHer(api, t, e.id) : { ok: false as const, fehler: ANMELDEN };
      setFehler(r.ok ? null : r.fehler);
      if (!r.ok) return;
      setMeldung(`„${e.name}“ ist wiederhergestellt und steht wieder im Bestand.`);
      danach();
    },
    [api, token, danach],
  );

  return { offen, meldung, fehler, archivieren, wiederherstellen, setOffen, setMeldung };
}
