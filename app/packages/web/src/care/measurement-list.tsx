import type { MeasurementRow } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state";
import { CARD_CLASSES, LIST_CLASSES } from "./notices";
import { QUALITY_NAME, dateText, valueText } from "./text";

/** The measurements of a specimen, newest first. Without a measurement the list says what to do (P-09). */
export function MeasurementList(props: {
  measurements: readonly MeasurementRow[];
  /** Moves the focus to the value field of the form. */
  onAdd: () => void;
}) {
  const { measurements } = props;
  return (
    <section aria-labelledby="verlauf-title" className="flex flex-col gap-3">
      <h2 id="verlauf-title" className="text-xl font-semibold">
        Verlauf
      </h2>
      {measurements.length === 0 ? (
        <EmptyState
          title="Noch keine Messung"
          description="Trage oben den ersten Messwert ein."
          action={{ label: "Messwert eintragen", onClick: props.onAdd }}
        />
      ) : (
        <ul className={LIST_CLASSES}>
          {measurements.map((m) => (
            <li key={m.id} className={CARD_CLASSES}>
              <h3 className="font-semibold">
                {valueText(m.value)} · {dateText(m.date)}
              </h3>
              <p className="text-muted-foreground">{QUALITY_NAME[m.quality]}</p>
              {m.note && <p className="text-muted-foreground">{m.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
