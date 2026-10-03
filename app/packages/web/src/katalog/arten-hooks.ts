import { useCallback, useEffect, useState } from "react";
import type { Art, ArtTreffer } from "@pflanzendex/core";
import type { ApiFehler } from "../kern";
import { ladeArt, sucheArten } from "./arten-api";

type Token = () => Promise<string | undefined>;
export const ANMELDEN: ApiFehler = {
  code: "zugriff.nicht_angemeldet",
  text: "Bitte melde dich neu an.",
};
export type Profil =
  { art: "laedt" } | { art: "fehler"; fehler: ApiFehler } | { art: "da"; wert: Art };

/** Sucht nach kurzer Pause nach dem Tippen; `neuLaden` ändert sich, wenn die Liste aktuell sein muss. */
export function useSuche(api: string, token: Token, suchtext: string, neuLaden: string) {
  const [treffer, setTreffer] = useState<readonly ArtTreffer[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<ApiFehler | null>(null);
  useEffect(() => {
    let aktuell = true;
    setLaedt(true);
    const lauf = async () => {
      const t = await token();
      const r = t ? await sucheArten(api, t, suchtext) : { ok: false as const, fehler: ANMELDEN };
      if (!aktuell) return;
      if (r.ok) setTreffer(r.wert);
      setFehler(r.ok ? null : r.fehler);
      setLaedt(false);
    };
    const timer = setTimeout(() => void lauf(), suchtext ? 250 : 0);
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [api, token, suchtext, neuLaden]);
  return { treffer, laedt, fehler };
}

/** Lädt das Profil einer Art; ein Fehler (auch „nicht sichtbar“) wird angezeigt, nie verschluckt. */
export function useProfil(api: string, token: Token) {
  const [profil, setProfil] = useState<Profil>({ art: "laedt" });
  const lade = useCallback(
    async (id: string) => {
      setProfil({ art: "laedt" });
      const t = await token();
      const r = t ? await ladeArt(api, t, id) : { ok: false as const, fehler: ANMELDEN };
      setProfil(r.ok ? { art: "da", wert: r.wert } : { art: "fehler", fehler: r.fehler });
    },
    [api, token],
  );
  return { profil, lade };
}
