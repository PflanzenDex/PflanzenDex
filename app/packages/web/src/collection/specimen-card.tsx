import type { SpecimenCard, MeasurementQuality } from "@pflanzendex/core";
import { UNKNOWN, dateText, valueText } from "./text";

const STATUS_TEXT = {
  plant: "Pflanze",
  cutting: "Steckling",
  archived: "Archiviert",
} as const;
const QUALITY_TEXT: Record<MeasurementQuality, string> = {
  healthy: "Gesund",
  etiolated: "Vergeilt/dünn",
};

function Photo({ card }: { card: SpecimenCard }) {
  if (!card.photo) {
    return (
      <div className="card-photo platzhalter">
        <span>Noch kein Foto</span>
      </div>
    );
  }
  return (
    <a
      className="card-photo"
      href={card.photo.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Foto von ${card.name} groß öffnen`}
    >
      <img
        src={card.photo.url}
        alt={`Foto von ${card.name} vom ${dateText(card.photo.date)}`}
        loading="lazy"
      />
    </a>
  );
}

function Measurement({ card }: { card: SpecimenCard }) {
  const m = card.lastMeasurement;
  if (!m) return <p className="quiet">noch keine Messung</p>;
  return (
    <>
      <p>
        Letzte Messung: {valueText(m.value)} ·{" "}
        <strong className={`quality-${m.quality}`}>{QUALITY_TEXT[m.quality]}</strong> am{" "}
        {dateText(m.date)}
      </p>
      {m.quality === "etiolated" && (
        <p className="quality-hint">
          Vergeilt/dünn: kein Erfolgssignal, auch bei Wachstum. Siehe Erfolgskriterien der Art.
        </p>
      )}
      {m.note && (
        <details className="note">
          <summary>Notiz der Messung</summary>
          <p>{m.note}</p>
        </details>
      )}
    </>
  );
}

function Treatment({ card }: { card: SpecimenCard }) {
  const b = card.treatment;
  if (!b) return <p className="quiet">keine offene Behandlung</p>;
  return (
    <p className="treatment">
      Behandlung: {b.reason} · <span className={`due-${b.dueDate.kind}`}>{b.dueDate.text}</span>
      {card.moreTreatments > 0 && <span className="quiet"> · +{card.moreTreatments} weitere</span>}
    </p>
  );
}

function Action(props: { text: string; aria: string; on: () => void }) {
  return (
    <button type="button" className="secondary" aria-label={props.aria} onClick={props.on}>
      {props.text}
    </button>
  );
}

/** A specimen card (US-BES-06): state and need for action at a glance, from derived data only. */
export function SpecimenCardView(props: {
  card: SpecimenCard;
  onMeasure?: ((e: { id: string; name: string }) => void) | undefined;
  /** Opens the archiving (US-BES-07). */
  onArchive?: ((e: { id: string; name: string }) => void) | undefined;
  /** Repots a cutting (US-BES-04); only cuttings get the button. */
  onRepot?: ((e: { id: string; name: string }) => void) | undefined;
  /** Gives the specimen a marker or changes it (US-BES-03). */
  onMark?: ((e: SpecimenCard) => void) | undefined;
}) {
  const { card, onMeasure, onArchive, onRepot, onMark } = props;
  const repot = card.status === "cutting" ? onRepot : undefined;
  return (
    <li className="specimen-card">
      <Photo card={card} />
      <h2>{card.name}</h2>
      <p className="quiet">Art: {card.speciesName ?? UNKNOWN}</p>
      <p className="quiet">
        Lichtzone: {card.lightZone ?? UNKNOWN} · Status: {STATUS_TEXT[card.status]}
      </p>
      <p className="quiet">Standort: {card.location ?? UNKNOWN}</p>
      <Measurement card={card} />
      <Treatment card={card} />
      {(onMeasure || onArchive || repot || onMark) && (
        <div className="actions">
          {onMeasure && (
            <Action text="Messen" aria={`Messen: ${card.name}`} on={() => onMeasure(card)} />
          )}
          {repot && (
            <Action text="Eingetopft" aria={`Eingetopft: ${card.name}`} on={() => repot(card)} />
          )}
          {onMark && (
            <Action
              text="Kennzeichen"
              aria={`Kennzeichen ändern: ${card.name}`}
              on={() => onMark(card)}
            />
          )}
          {onArchive && (
            <Action
              text="Archivieren"
              aria={`Archivieren: ${card.name}`}
              on={() => onArchive(card)}
            />
          )}
        </div>
      )}
    </li>
  );
}
