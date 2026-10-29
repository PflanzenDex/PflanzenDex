import { cva } from "class-variance-authority";
import type { SpecimenCard, MeasurementQuality } from "@pflanzendex/core";
import type { PhotoAccess } from "@/lib/use-stored-photo";
import { Button } from "@/components/ui/button/button";
import { Actions, CARD, Photo, Quiet } from "../parts/parts";
import { UNKNOWN, dateText, valueText, zoneText } from "../../model/text";

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

/** From whom a received specimen came and when (US-SOZ-13); an own specimen has no such line. */
function Provenance({ value }: { value: SpecimenCard["provenance"] }) {
  if (!value) return null;
  return (
    <Quiet>
      Erhalten von {value.from ?? "einem Freund"} am {dateText(value.date.slice(0, 10))}
    </Quiet>
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

type On = ((e: SpecimenCard) => void) | undefined;
type Handlers = {
  onMeasure?: On;
  /** Opens the archiving (US-BES-07). */
  onArchive?: On;
  /** Repots a cutting (US-BES-04); only cuttings get the button. */
  onRepot?: On;
  /** Gives the specimen a marker or changes it (US-BES-03). */
  onMark?: On;
  /** Corrects the catch date (US-BES-11). */
  onCatchDate?: On;
  /** Sets, changes or clears the own light zone (US-LIC-02, US-BES-04). */
  onLightZone?: On;
};

/** The buttons of a card: one per handler that is wired; a repot only for a cutting. */
function CardActions({ card, ...h }: Handlers & { card: SpecimenCard }) {
  const n = card.name;
  const items: [On, string, string][] = [
    [h.onMeasure, "Messen", `Messen: ${n}`],
    [card.status === "cutting" ? h.onRepot : undefined, "Eingetopft", `Eingetopft: ${n}`],
    [h.onMark, "Kennzeichen", `Kennzeichen ändern: ${n}`],
    [h.onCatchDate, "Fangdatum", `Fangdatum korrigieren: ${n}`],
    [h.onLightZone, "Lichtzone", `Lichtzone ändern: ${n}`],
    [h.onArchive, "Archivieren", `Archivieren: ${n}`],
  ];
  const wired = items.flatMap(([on, text, aria]) => (on ? [{ on, text, aria }] : []));
  if (wired.length === 0) return null;
  return (
    <Actions>
      {wired.map((a) => (
        <Action key={a.text} text={a.text} aria={a.aria} on={() => a.on(card)} />
      ))}
    </Actions>
  );
}

/** A specimen card (US-BES-06): state and need for action at a glance, from derived data only. */
export function SpecimenCardView(
  props: Handlers & { card: SpecimenCard; photoAccess: PhotoAccess; showName?: boolean },
) {
  const { card, photoAccess, showName = true, ...handlers } = props;
  return (
    <li className={`animate-list-in ${CARD}`}>
      <Photo card={card} access={photoAccess} />
      {showName ? <h2 className="mt-2 text-lg font-semibold">{card.name}</h2> : null}
      <Quiet>Art: {card.speciesName ?? UNKNOWN}</Quiet>
      <Quiet>
        Lichtzone: {zoneText(card)} · Status: {STATUS_TEXT[card.status]}
      </Quiet>
      <Quiet>Standort: {card.location ?? UNKNOWN}</Quiet>
      <Provenance value={card.provenance} />
      <Measurement card={card} />
      <Treatment card={card} />
      <CardActions card={card} {...handlers} />
    </li>
  );
}
