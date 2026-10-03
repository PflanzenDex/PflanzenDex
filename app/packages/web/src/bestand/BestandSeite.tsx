import "./bestand.css";
import { useCallback, useState } from "react";
import type { Art, Exemplar } from "@pflanzendex/core";
import type { ApiFehler } from "../kern";
import { AnlegenFormular, type AnlegenEingabe } from "./anlegen-formular";
import { ArchivListe } from "./archiv-liste";
import { ArchivierenFormular } from "./archiv-formular";
import { BestandListe } from "./bestand-liste";
import { legeExemplarAn } from "./exemplare-api";
import { ANMELDEN, useBestand, type Daten, type Token } from "./use-bestand";
import { useArchivieren } from "./use-archivieren";

function Angelegt({ exemplar }: { exemplar: Exemplar }) {
  return (
    <p role="status" className="hinweis">
      Exemplar „{exemplar.name}“ ist angelegt.
      {exemplar.standortId === null &&
        " Der Standort ist unbekannt, denn ein Soll-Standort steht erst mit den Pflegephasen fest."}
    </p>
  );
}

function Ladefehler(props: { fehler: ApiFehler; onNeuLaden: () => void }) {
  return (
    <div role="alert" className="warnung">
      <p>{props.fehler.text}</p>
      <div className="aktionen">
        <button type="button" className="sekundaer" onClick={props.onNeuLaden}>
          Erneut laden
        </button>
      </div>
    </div>
  );
}

/**
 * Bestand, Exemplar anlegen (US-BES-02) und archivieren (US-BES-07). Mit einer gewählten Art zeigt die Seite das
 * Formular, sonst die Liste mit dem Archiv darunter. Die Wahl der Art kommt aus dem Katalog (`katalog` kennt `bestand`
 * nicht, die Verdrahtung macht die App).
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
  const nachAktion = useCallback(() => setNeuLaden((n) => n + 1), []);
  const archiv = useArchivieren(api, token, nachAktion);
  const senden = useCallback(
    async (eingabe: AnlegenEingabe): Promise<ApiFehler | null> => {
      const t = await token();
      if (!t || !neueArt) return ANMELDEN;
      const r = await legeExemplarAn(api, t, { artId: neueArt.id, ...eingabe });
      if (!r.ok) return r.fehler;
      archiv.setMeldung(null);
      setAngelegt(r.wert);
      nachAktion();
      onAbgeschlossen();
      return null;
    },
    [api, token, neueArt, onAbgeschlossen, nachAktion, archiv],
  );
  return (
    <div className="licht bestand">
      {daten.art === "laedt" && <p role="status">Bestand wird geladen …</p>}
      {daten.art === "fehler" && <Ladefehler fehler={daten.fehler} onNeuLaden={nachAktion} />}
      {daten.art === "da" && neueArt && (
        <AnlegenFormular
          art={neueArt}
          standorte={daten.standorte}
          onSenden={senden}
          onAbbrechen={props.onArtWaehlen}
        />
      )}
      {daten.art === "da" && !neueArt && archiv.offen && (
        <ArchivierenFormular
          name={archiv.offen.name}
          onSenden={archiv.archivieren}
          onAbbrechen={() => archiv.setOffen(null)}
        />
      )}
      {daten.art === "da" && !neueArt && !archiv.offen && (
        <Liste daten={daten} archiv={archiv} angelegt={angelegt} props={props} />
      )}
    </div>
  );
}

function Liste(p: {
  daten: Extract<Daten, { art: "da" }>;
  archiv: ReturnType<typeof useArchivieren>;
  angelegt: Exemplar | null;
  props: Parameters<typeof BestandSeite>[0];
}) {
  const { daten, archiv } = p;
  return (
    <>
      {archiv.meldung ? (
        <p role="status" className="hinweis">
          {archiv.meldung}
        </p>
      ) : (
        p.angelegt && <Angelegt exemplar={p.angelegt} />
      )}
      {archiv.fehler && (
        <div role="alert" className="warnung">
          <p>{archiv.fehler.text}</p>
        </div>
      )}
      <BestandListe
        karten={daten.karten}
        onArtWaehlen={p.props.onArtWaehlen}
        onArchivieren={(e) => {
          archiv.setMeldung(null);
          archiv.setOffen(e);
        }}
        {...(p.props.onMessen ? { onMessen: p.props.onMessen } : {})}
      />
      <ArchivListe eintraege={daten.archiv} onWiederherstellen={archiv.wiederherstellen} />
    </>
  );
}
