import { artHinweise, type Art } from "@pflanzendex/core";
import { SCHWIERIGKEIT, STATUS, WACHSTUM, lux, oderUnbekannt, ruhephase } from "./text";

function zeilen(art: Art): [string, string][] {
  const familie = [art.familieDeutsch, art.familieLateinisch].filter(Boolean).join(" · ");
  return [
    ["Deutscher Name", oderUnbekannt(art.deutscherName)],
    ["Englischer Name", oderUnbekannt(art.englischerName)],
    ["Synonyme", art.synonyme.length > 0 ? art.synonyme.join(", ") : "unbekannt"],
    ["Familie", familie || "unbekannt"],
    ["Schwierigkeit", SCHWIERIGKEIT[art.schwierigkeit] ?? "unbekannt"],
    ["Standard-Stufe", `Stufe ${art.standardStufe}`],
    ["Lichtbedarf", lux(art.lichtbedarfLux)],
    ["Ruhephase", ruhephase(art)],
    ["Standort-Hinweis", oderUnbekannt(art.standortHinweis)],
    ["Wachstumsmaß", WACHSTUM[art.wachstumsmass]],
    ["Vergeilung-Anzeichen", art.vergeilungAnzeichen],
    ["Gießhinweis", oderUnbekannt(art.giesshinweis)],
    ["Substrat", oderUnbekannt(art.substrat)],
    ["Rückschnitt", oderUnbekannt(art.rueckschnitt)],
    ["Wuchs-Hacks", oderUnbekannt(art.wuchsHacks)],
    ["Erfolgskriterien", art.erfolgskriterien],
    ["Botanische Story", oderUnbekannt(art.botanischeStory)],
    ["Quelle", oderUnbekannt(art.quelle)],
  ];
}

/** Profil mit den Feldern aus DM-BES-01; fehlende Angaben heißen „unbekannt“ (P-08), Hinweise nennen die nächste Handlung (P-09). */
export function ArtProfil(props: { art: Art; onWaehlen?: () => void; onZurueck?: () => void }) {
  const { art } = props;
  return (
    <article aria-labelledby="art-titel">
      {props.onZurueck && (
        <button type="button" className="sekundaer zurueck" onClick={props.onZurueck}>
          Zurück zur Suche
        </button>
      )}
      <h1 id="art-titel">
        <i>{art.lateinischerName}</i>
      </h1>
      <p className="marke">{STATUS[art.pruefstatus]}</p>
      {artHinweise(art).map((h) => (
        <p key={h.text} className="hinweis">
          {h.text} {h.naechsteHandlung}
        </p>
      ))}
      <dl className="daten profil">
        {zeilen(art).map(([name, wert]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{wert}</dd>
          </div>
        ))}
      </dl>
      {props.onWaehlen && (
        <div className="aktionen">
          <button type="button" className="primaer" onClick={props.onWaehlen}>
            Diese Art wählen
          </button>
        </div>
      )}
    </article>
  );
}
