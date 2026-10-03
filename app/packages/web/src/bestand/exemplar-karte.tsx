import type { ExemplarKarte, MessQualitaet } from "@pflanzendex/core";
import { UNBEKANNT, datumText } from "./text";

const STATUS_TEXT = {
  pflanze: "Pflanze",
  steckling: "Steckling",
  archiviert: "Archiviert",
} as const;
const QUALITAET_TEXT: Record<MessQualitaet, string> = {
  gesund: "Gesund",
  vergeilt: "Vergeilt/dünn",
};

function Foto({ karte }: { karte: ExemplarKarte }) {
  if (!karte.foto) {
    return (
      <div className="karte-foto platzhalter">
        <span>Noch kein Foto</span>
      </div>
    );
  }
  return (
    <a
      className="karte-foto"
      href={karte.foto.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Foto von ${karte.name} groß öffnen`}
    >
      <img
        src={karte.foto.url}
        alt={`Foto von ${karte.name} vom ${datumText(karte.foto.datum)}`}
        loading="lazy"
      />
    </a>
  );
}

function Messung({ karte }: { karte: ExemplarKarte }) {
  const m = karte.letzteMessung;
  if (!m) return <p className="leise">noch keine Messung</p>;
  return (
    <>
      <p>
        Letzte Messung:{" "}
        <strong className={`qualitaet-${m.qualitaet}`}>{QUALITAET_TEXT[m.qualitaet]}</strong> am{" "}
        {datumText(m.datum)}
      </p>
      {m.qualitaet === "vergeilt" && (
        <p className="qualitaet-hinweis">
          Vergeilt/dünn: kein Erfolgssignal, auch bei Wachstum. Siehe Erfolgskriterien der Art.
        </p>
      )}
      {m.notiz && (
        <details className="notiz">
          <summary>Notiz der Messung</summary>
          <p>{m.notiz}</p>
        </details>
      )}
    </>
  );
}

function Behandlung({ karte }: { karte: ExemplarKarte }) {
  const b = karte.behandlung;
  if (!b) return <p className="leise">keine offene Behandlung</p>;
  return (
    <p className="behandlung">
      Behandlung: {b.grund} ·{" "}
      <span className={`faellig-${b.faelligkeit.art}`}>{b.faelligkeit.text}</span>
      {karte.weitereBehandlungen > 0 && (
        <span className="leise"> · +{karte.weitereBehandlungen} weitere</span>
      )}
    </p>
  );
}

/** Eine Exemplar-Karte (US-BES-06): Zustand und Handlungsbedarf auf einen Blick, nur aus abgeleiteten Daten. */
export function ExemplarKarteAnsicht({ karte }: { karte: ExemplarKarte }) {
  return (
    <li className="exemplar-karte">
      <Foto karte={karte} />
      <h3>{karte.name}</h3>
      <p className="leise">Art: {karte.artName ?? UNBEKANNT}</p>
      <p className="leise">
        Lichtzone: {karte.lichtzone ?? UNBEKANNT} · Status: {STATUS_TEXT[karte.status]}
      </p>
      <p className="leise">Standort: {karte.standort ?? UNBEKANNT}</p>
      <Messung karte={karte} />
      <Behandlung karte={karte} />
    </li>
  );
}
