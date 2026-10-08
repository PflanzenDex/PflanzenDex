import type { MeasurementView } from "@pflanzendex/core";
import { Badge } from "@/components/ui/badge";
import { GrowthSummary } from "./growth-summary/growth-summary";
import { dateText, massName, measurementText, QUALITY_NAME } from "../text";

/** What to measure, last measurement and last rating (US-WAC-01); derived, never stored (P-01). */
export function MeasurementHeader({ view }: { view: MeasurementView }) {
  const { last, lastRating } = view;
  return (
    <dl className="m-0 grid gap-3">
      {view.status === "cutting" && (
        <div>
          <dt className="font-semibold">Status</dt>
          <dd className="m-0 mt-0.5">
            <Badge variant="outline">Steckling</Badge>
          </dd>
        </div>
      )}
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
      <GrowthSummary growth={view.growth} />
      <div>
        <dt className="font-semibold">Letzte Bewertung</dt>
        <dd className="m-0 mt-0.5 text-muted-foreground">
          {lastRating && last
            ? [QUALITY_NAME[lastRating], dateText(last.date), last.note].filter(Boolean).join(" · ")
            : "noch keine Bewertung"}
        </dd>
      </div>
    </dl>
  );
}
