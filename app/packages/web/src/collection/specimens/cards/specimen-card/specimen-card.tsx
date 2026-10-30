import { cva } from "class-variance-authority";
import type { SpecimenCard, MeasurementQuality } from "@pflanzendex/core";
import { Quiet } from "../parts/parts";
import { dateText, valueText } from "../../model/text";
import { overdueChip } from "@/lib/format";

// The facts of a specimen card (US-BES-06): the last measurement, the open treatment and the provenance. The plant layer
// (US-QS-23) places them in its tabs; derived data only.

export const STATUS_TEXT = {
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

export function Measurement({ card }: { card: SpecimenCard }) {
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
export function Provenance({ value }: { value: SpecimenCard["provenance"] }) {
  if (!value) return null;
  return (
    <Quiet>
      Erhalten von {value.from ?? "einem Freund"} am {dateText(value.date.slice(0, 10))}
    </Quiet>
  );
}

export function Treatment({ card }: { card: SpecimenCard }) {
  const b = card.treatment;
  if (!b) return <Quiet>keine offene Behandlung</Quiet>;
  return (
    <p>
      Behandlung: {b.reason} ·{" "}
      <span data-due={b.dueDate.kind} className={dueMark({ kind: b.dueDate.kind })}>
        {(b.dueDate.kind === "overdue" ? overdueChip(b.dueDate.text) : null) ?? b.dueDate.text}
      </span>
      {card.moreTreatments > 0 && (
        <span className="text-muted-foreground"> · +{card.moreTreatments} weitere</span>
      )}
    </p>
  );
}
