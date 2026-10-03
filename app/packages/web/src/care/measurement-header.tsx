import type { MeasurementView } from "@pflanzendex/core";
import { massName, measurementText, QUALITY_NAME } from "./text";

/** What to measure, last measurement and last rating (US-WAC-01); derived, never stored (P-01). */
export function MeasurementHeader({ view }: { view: MeasurementView }) {
  const { last, lastRating } = view;
  return (
    <dl className="messkopf">
      <div>
        <dt>Was messen?</dt>
        <dd>
          {massName(view.growthMeasure)}. Miss immer dasselbe Maß an derselben Stelle, sonst sind
          die Werte nicht vergleichbar.
        </dd>
      </div>
      <div>
        <dt>Letzte Messung</dt>
        <dd>{last ? measurementText(last) : "noch keine Messung"}</dd>
      </div>
      <div>
        <dt>Letzte Bewertung</dt>
        <dd>{lastRating ? QUALITY_NAME[lastRating] : "noch keine Bewertung"}</dd>
      </div>
    </dl>
  );
}
