import { cva } from "class-variance-authority";
import { localToday, type SpecimenCard, type MeasurementQuality } from "@pflanzendex/core";
import { Quiet } from "../parts/parts";
import { dateText, valueText } from "../../model/text";
import { overdueChip, summaryDate } from "@/shared/lib/format";
import { currentTimeZone } from "../../../../shared/data";
import { DisclosureSummary } from "@/shared/ui/more-help.disclosure-summary";

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
  defaultVariants: { quality: "healthy" },
});
const dueMark = cva("", {
  variants: {
    kind: {
      overdue: "border-b-2 border-warning-border bg-warning px-1 font-bold",
      today: "",
      soon: "",
    },
  },
  defaultVariants: { kind: "soon" },
});

export function Measurement({ card }: { card: SpecimenCard }) {
  const m = card.lastMeasurement;
  if (!m) return <Quiet>noch keine Messung</Quiet>;
  // Within 7 days the relative word stands alone ("vor 6 Tagen"); beyond, the absolute date keeps its "am" (SG-FMT-01).
  const when = summaryDate(m.date, localToday(new Date(), currentTimeZone()));
  return (
    <>
      <p>
        Letzte Messung: {valueText(m.value)} ·{" "}
        <strong data-quality={m.quality} className={qualityMark({ quality: m.quality })}>
          {QUALITY_TEXT[m.quality]}
        </strong>{" "}
        {when === dateText(m.date) ? <>am {when}</> : when}
      </p>
      {m.quality === "etiolated" && (
        <p className="border-l-4 border-warning-border bg-warning px-2 py-1.5 text-sm text-warning-foreground">
          Vergeilt/dünn: kein Erfolgssignal, auch bei Wachstum. Siehe Erfolgskriterien der Art.
        </p>
      )}
      {m.note && (
        <details>
          <DisclosureSummary className="rounded-md">Notiz der Messung</DisclosureSummary>
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
  if (!b) return <Quiet>Keine offene Behandlung.</Quiet>;
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
