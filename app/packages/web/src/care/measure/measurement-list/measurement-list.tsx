import type { MeasurementRow } from "@pflanzendex/core";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { texts } from "@/shared/lib/text-rules/texts";
import { MeasurementPhoto } from "../measurement-header/measurement-photo";
import { PhotoAction } from "../measurement-header/photo-action";
import { CARD_CLASSES } from "../../shared/notices/notices";
import { QUALITY_NAME, dateText, valueText } from "../../shared/text";
import table from "./measurement-list.de.json";

const t = texts(table);

/**
 * The measurements of a specimen, newest first, paged by the free height of the layer "Verlauf" (US-QS-15): whole
 * entries per page, `data-page-fit`. The pictures are the compact ones of a paged list, so one entry with its photo
 * fits a phone (`MeasurementPhoto`, US-QS-23). The caller shows the empty state; this list has at least one measurement.
 */
export function MeasurementList(props: {
  measurements: readonly MeasurementRow[];
  /** Ids of the measurements that set a personal record of the specimen (US-ACH-05); none in calm mode. */
  records?: ReadonlySet<string> | undefined;
  /** What the photos need to be loaded privately (P-05). */
  photo: { api: string; token: () => Promise<string | undefined>; specimenId: string };
  /** Reloads the course after a photo was saved. */
  onPhotoSaved: () => void;
}) {
  const { measurements } = props;
  return (
    <section aria-labelledby="verlauf-title" className="flex min-h-0 flex-1 flex-col">
      <h2 id="verlauf-title" className="sr-only">
        {t("heading")}
      </h2>
      <Pager
        items={measurements}
        // The starting value until the layout measures the free height of the layer (US-QS-15).
        pageSize={1}
        fit
        label={t("list")}
        param={LAYER_PARAM}
        replace
        getKey={(m) => m.id}
        renderItem={(m, i) => (
          <div className={CARD_CLASSES}>
            <h3 className="font-semibold">
              {valueText(m.value)} · {dateText(m.date)}
            </h3>
            <p className="text-muted-foreground">{QUALITY_NAME[m.quality]}</p>
            {props.records?.has(m.id) && <p className="text-sm">{t("record")}</p>}
            {m.note && <p className="text-muted-foreground">{m.note}</p>}
            {m.photo && (
              <MeasurementPhoto {...props.photo} measurementId={m.id} date={m.date} compact />
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
          </div>
        )}
      />
    </section>
  );
}
