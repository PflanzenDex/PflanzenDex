import type { MeasurementRow } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state";
import { GrowthChart } from "./measurement-header/growth-chart";
import { MeasurementPhoto } from "./measurement-header/measurement-photo";
import { PhotoAction } from "./measurement-header/photo-action";
import { CARD_CLASSES, LIST_CLASSES } from "./notices";
import { QUALITY_NAME, dateText, valueText } from "./text";

/** The measurements of a specimen, newest first. Without a measurement the list says what to do (P-09). */
export function MeasurementList(props: {
  measurements: readonly MeasurementRow[];
  /** What the photos need to be loaded privately (P-05). */
  photo: { api: string; token: () => Promise<string | undefined>; specimenId: string };
  /** Reloads the course after a photo was saved. */
  onPhotoSaved: () => void;
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
        <>
          <GrowthChart measurements={measurements} />
          <ul className={LIST_CLASSES}>
            {measurements.map((m, i) => (
              <li key={m.id} className={CARD_CLASSES}>
                <h3 className="font-semibold">
                  {valueText(m.value)} · {dateText(m.date)}
                </h3>
                <p className="text-muted-foreground">{QUALITY_NAME[m.quality]}</p>
                {m.note && <p className="text-muted-foreground">{m.note}</p>}
                {m.photo && (
                  <MeasurementPhoto {...props.photo} measurementId={m.id} date={m.date} />
                )}
                {/* The server attaches a photo to the day's latest measurement, so only that one offers it (FR-WAC-07). */}
                {measurements[i - 1]?.date !== m.date && (
                  <PhotoAction
                    access={props.photo}
                    specimenId={props.photo.specimenId}
                    date={m.date}
                    hasPhoto={m.photo !== null}
                    onSaved={props.onPhotoSaved}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
