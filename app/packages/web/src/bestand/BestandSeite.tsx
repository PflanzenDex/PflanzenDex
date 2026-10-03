import "./bestand.css";
import { useCallback, useState } from "react";
import type { Art, Exemplar } from "@pflanzendex/core";
import { LadeFehler, type ApiFehler } from "../kern";
import { AnlegenFormular, type AnlegenEingabe } from "./anlegen-formular";
import { ArchivListe } from "./archiv-liste";
import { ArchivierenFormular } from "./archiv-formular";
import { BestandListe } from "./bestand-liste";
import { legeExemplarAn } from "./exemplare-api";
import { ANMELDEN, useBestand, type Daten, type Token } from "./use-bestand";
import { useArchivieren } from "./use-archivieren";
import { useEintopfen } from "./use-eintopfen";
import { VerteilungAnsicht } from "./verteilung-ansicht";

function Angelegt({ exemplar }: { exemplar: Exemplar }) {
  return (
    <p role="status" className="hinweis">
      {exemplar.status === "steckling" ? "Steckling" : "Exemplar"} „{exemplar.name}“ ist angelegt.
      {exemplar.status === "steckling" &&
        " Er steht unter Stecklingslicht; tippe auf der Karte „Eingetopft“, sobald du ihn eintopfst."}
      {exemplar.standortId === null &&
        " Der Standort ist unbekannt, denn ein Soll-Standort steht erst mit den Pflegephasen fest."}
    </p>
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
  const topf = useEintopfen(api, token, nachAktion);
  const senden = useCallback(
    async (eingabe: AnlegenEingabe): Promise<ApiFehler | null> => {
      const t = await token();
      if (!t || !neueArt) return ANMELDEN;
      const r = await legeExemplarAn(api, t, { artId: neueArt.id, ...eingabe });
      if (!r.ok) return r.fehler;
      archiv.setMeldung(null);
      topf.setMeldung(null);
      setAngelegt(r.wert);
      nachAktion();
      onAbgeschlossen();
      return null;
    },
    [api, token, neueArt, onAbgeschlossen, nachAktion, archiv, topf],
  );
  return (
    <div className="licht bestand">
      {daten.art === "laedt" && <p role="status">Bestand wird geladen …</p>}
      {daten.art === "fehler" && <LadeFehler fehler={daten.fehler} onNeuLaden={nachAktion} />}
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
        <Liste daten={daten} archiv={archiv} topf={topf} angelegt={angelegt} props={props} />
      )}
    </div>
  );
}

function Liste(p: {
  daten: Extract<Daten, { art: "da" }>;
  archiv: ReturnType<typeof useArchivieren>;
  topf: ReturnType<typeof useEintopfen>;
  angelegt: Exemplar | null;
  props: Parameters<typeof BestandSeite>[0];
}) {
  const { daten, archiv, topf } = p;
  const meldung = archiv.meldung ?? topf.meldung;
  const fehler = archiv.fehler ?? topf.fehler;
  return (
    <>
      {meldung ? (
        <p role="status" className="hinweis">
          {meldung}
        </p>
      ) : (
        p.angelegt && <Angelegt exemplar={p.angelegt} />
      )}
      {fehler && (
        <div role="alert" className="warnung">
          <p>{fehler.text}</p>
        </div>
      )}
      <VerteilungAnsicht verteilung={daten.verteilung} />
      <BestandListe
        karten={daten.karten}
        onArtWaehlen={p.props.onArtWaehlen}
        onArchivieren={(e) => {
          archiv.setMeldung(null);
          topf.setMeldung(null);
          archiv.setOffen(e);
        }}
        onEintopfen={(e) => {
          archiv.setMeldung(null);
          void topf.eintopfen(e);
        }}
        {...(p.props.onMessen ? { onMessen: p.props.onMessen } : {})}
      />
      <ArchivListe eintraege={daten.archiv} onWiederherstellen={archiv.wiederherstellen} />
    </>
  );
}
