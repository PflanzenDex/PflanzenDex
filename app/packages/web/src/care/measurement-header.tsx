import type { MeasurementView } from "@pflanzendex/core";
import { massName, measurementText, QUALITY_NAME } from "./text";

/** What to measure, last measurement and last rating (US-WAC-01); derived, never stored (P-01). */
export function MeasurementHeader({ view }: { view: MeasurementView }) {
  const { last, lastRating } = view;
  return (
    <dl className="m-0 grid gap-3">
      <div>
        <dt className="font-semibold">Was messen?</dt>
        <dd className="m-0 mt-0.5 text-muted-foreground">
          {massName(view.growthMeasure)}. Miss immer dasselbe Maß an derselben Stelle, sonst sind
          die Werte nicht vergleichbar.
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Letzte Messung</dt>
        <dd className="m-0 mt-0.5 text-muted-foreground">
          {last ? measurementText(last) : "noch keine Messung"}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Letzte Bewertung</dt>
        <dd className="m-0 mt-0.5 text-muted-foreground">
          {lastRating ? QUALITY_NAME[lastRating] : "noch keine Bewertung"}
        </dd>
      </div>
    </dl>
  );
}
