import { useCallback, useEffect, useState } from "react";
import type { Art, ArtTreffer } from "@pflanzendex/core";
import type { ApiFehler } from "../licht/licht-api";
import { ladeArt, schlageVor, sucheArten } from "./arten-api";
import { ArtProfil } from "./profil-ansicht";
import { ArtSuche } from "./suche-ansicht";
import { VorschlagFormular } from "./vorschlag-formular";

type Ansicht = { art: "suche" } | { art: "vorschlag" } | { art: "profil"; id: string };
type Profil = { art: "laedt" } | { art: "fehler"; fehler: ApiFehler } | { art: "da"; wert: Art };
const ANMELDEN: ApiFehler = { code: "zugriff.nicht_angemeldet", text: "Bitte melde dich neu an." };

/**
 * Art im Katalog suchen, ansehen, wählen oder vorschlagen (US-BES-01). „Wählen“ merkt sich die Art; das Exemplar
 * dazu legt US-BES-02 an, das es noch nicht gibt (die Seite sagt das offen).
 */
export function ArtenSeite(props: { api: string; token: () => Promise<string | undefined> }) {
  const { api, token } = props;
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: "suche" });
  const [suchtext, setSuchtext] = useState("");
  const [treffer, setTreffer] = useState<readonly ArtTreffer[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<ApiFehler | null>(null);
  const [profil, setProfil] = useState<Profil>({ art: "laedt" });
  const [gewaehlt, setGewaehlt] = useState<Art | null>(null);
  const [neu, setNeu] = useState(false);

  useEffect(() => {
    let aktuell = true;
    setLaedt(true);
    const timer = setTimeout(
      () =>
        void (async () => {
          const t = await token();
          const r = t
            ? await sucheArten(api, t, suchtext)
            : { ok: false as const, fehler: ANMELDEN };
          if (!aktuell) return;
          if (r.ok) setTreffer(r.wert);
          setFehler(r.ok ? null : r.fehler);
          setLaedt(false);
        })(),
      suchtext ? 250 : 0,
    );
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [api, token, suchtext, ansicht.art]);

  const oeffne = useCallback(
    async (id: string) => {
      setAnsicht({ art: "profil", id });
      setProfil({ art: "laedt" });
      const t = await token();
      const r = t ? await ladeArt(api, t, id) : { ok: false as const, fehler: ANMELDEN };
      setProfil(r.ok ? { art: "da", wert: r.wert } : { art: "fehler", fehler: r.fehler });
    },
    [api, token],
  );

  async function senden(eingabe: Record<string, unknown>): Promise<ApiFehler | null> {
    const t = await token();
    const r = t ? await schlageVor(api, t, eingabe) : { ok: false as const, fehler: ANMELDEN };
    if (!r.ok) return r.fehler;
    setNeu(true);
    void oeffne(r.wert.id);
    return null;
  }

  const zurueck = () => {
    setNeu(false);
    setAnsicht({ art: "suche" });
  };
  return (
    <div className="licht arten">
      {gewaehlt && (
        <p role="status" className="hinweis">
          Gewählt: <i>{gewaehlt.lateinischerName}</i>. Das Exemplar dazu legst du an, sobald es
          diese Funktion gibt (US-BES-02).
        </p>
      )}
      {fehler && ansicht.art === "suche" && (
        <p role="alert" className="warnung">
          {fehler.text}
        </p>
      )}
      {ansicht.art === "suche" && (
        <ArtSuche
          suchtext={suchtext}
          treffer={treffer}
          laedt={laedt}
          onSuche={setSuchtext}
          onOeffnen={(id) => void oeffne(id)}
          onVorschlagen={() => setAnsicht({ art: "vorschlag" })}
        />
      )}
      {ansicht.art === "vorschlag" && (
        <VorschlagFormular
          start={suchtext}
          onSenden={senden}
          onAbbrechen={zurueck}
          onVorhandene={(id) => void oeffne(id)}
        />
      )}
      {ansicht.art === "profil" && (
        <>
          {neu && (
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
              onWaehlen={() => setGewaehlt(profil.wert)}
              onZurueck={zurueck}
            />
          ) : (
            <button type="button" className="sekundaer" onClick={zurueck}>
              Zurück zur Suche
            </button>
          )}
        </>
      )}
    </div>
  );
}
