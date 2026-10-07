import { cva } from "class-variance-authority";
import type { SpecimenCard, MeasurementQuality } from "@pflanzendex/core";
import { Button } from "@/components/ui/button";
import { Actions, CARD, Quiet } from "./parts";
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

/** Etiolated growth is marked by the warning tokens plus the word, never by colour alone (DS-38, P-08). */
const qualityMark = cva("", {
  variants: {
    quality: { healthy: "", etiolated: "border-b-2 border-warning-border bg-warning px-1" },
  },
});
const dueMark = cva("", {
  variants: {
    kind: {
      overdue: "border-b-2 border-warning-border bg-warning px-1 font-bold",
      today: "",
      soon: "",
    },
  },
});

function Photo({ card }: { card: SpecimenCard }) {
  if (!card.photo) {
    return (
      <div className="grid min-h-[72px] place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
        <span>Noch kein Foto</span>
      </div>
    );
  }
  return (
    <a
      className="block aspect-[4/3] overflow-hidden rounded-lg bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      href={card.photo.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Foto von ${card.name} groß öffnen`}
    >
      <img
        className="block size-full object-cover"
        src={card.photo.url}
        alt={`Foto von ${card.name} vom ${dateText(card.photo.date)}`}
        loading="lazy"
      />
    </a>
  );
}

function Measurement({ card }: { card: SpecimenCard }) {
  const m = card.lastMeasurement;
  if (!m) return <Quiet>noch keine Messung</Quiet>;
  return (
    <>
      <p>
        Letzte Messung: {valueText(m.value)} ·{" "}
        <strong data-quality={m.quality} className={qualityMark({ quality: m.quality })}>
          {QUALITY_TEXT[m.quality]}
        </strong>{" "}
        am {dateText(m.date)}
      </p>
      {m.quality === "etiolated" && (
        <p className="border-l-4 border-warning-border bg-warning px-2 py-1.5 text-sm text-warning-foreground">
          Vergeilt/dünn: kein Erfolgssignal, auch bei Wachstum. Siehe Erfolgskriterien der Art.
        </p>
      )}
      {m.note && (
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Notiz der Messung
          </summary>
          <p>{m.note}</p>
        </details>
      )}
    </>
  );
}

function Treatment({ card }: { card: SpecimenCard }) {
  const b = card.treatment;
  if (!b) return <Quiet>keine offene Behandlung</Quiet>;
  return (
    <p>
      Behandlung: {b.reason} ·{" "}
      <span data-due={b.dueDate.kind} className={dueMark({ kind: b.dueDate.kind })}>
        {b.dueDate.text}
      </span>
      {card.moreTreatments > 0 && (
        <span className="text-muted-foreground"> · +{card.moreTreatments} weitere</span>
      )}
    </p>
  );
}

function Action(props: { text: string; aria: string; on: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="flex-1 whitespace-nowrap"
      aria-label={props.aria}
      onClick={props.on}
    >
      {props.text}
    </Button>
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
  /** Corrects the catch date (US-BES-11). */
  onCatchDate?: ((e: SpecimenCard) => void) | undefined;
}) {
  const { card, onMeasure, onArchive, onRepot, onMark, onCatchDate } = props;
  const repot = card.status === "cutting" ? onRepot : undefined;
  return (
    <li className={`animate-list-in ${CARD}`}>
      <Photo card={card} />
      <h2 className="mt-2 text-lg font-semibold">{card.name}</h2>
      <Quiet>Art: {card.speciesName ?? UNKNOWN}</Quiet>
      <Quiet>
        Lichtzone: {card.lightZone ?? UNKNOWN} · Status: {STATUS_TEXT[card.status]}
      </Quiet>
      <Quiet>Standort: {card.location ?? UNKNOWN}</Quiet>
      <Measurement card={card} />
      <Treatment card={card} />
      {(onMeasure || onArchive || repot || onMark || onCatchDate) && (
        <Actions>
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
          {onCatchDate && (
            <Action
              text="Fangdatum"
              aria={`Fangdatum korrigieren: ${card.name}`}
              on={() => onCatchDate(card)}
            />
          )}
          {onArchive && (
            <Action
              text="Archivieren"
              aria={`Archivieren: ${card.name}`}
              on={() => onArchive(card)}
            />
          )}
        </Actions>
      )}
    </li>
  );
}
