import type { ReactNode } from "react";
import type { MeasurementView } from "@pflanzendex/core";
import { Badge } from "@/components/ui/display/badge/badge";
import { GrowthSummary } from "./growth-summary/growth-summary";
import { dateText, massName, measurementText, QUALITY_NAME } from "../../shared/text";

/**
 * A closed block with a summary, used for the facts and the optional form fields of the measure page (US-WAC-01,
 * US-QS-23). Folded, not hidden: the summary names what is inside (P-10).
 */
export function Folded({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="text-sm">
      <summary className="flex min-h-[44px] cursor-pointer items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {summary}
      </summary>
      <div className="mt-1 grid gap-3">{children}</div>
    </details>
  );
}

/**
 * The one fact line of the measure page (US-WAC-01): the last measurement with its value and date; a cutting is marked
 * beside it, and `action` (the link to the course) sits in the same row. The other facts are in the layer of the
 * course (`MeasurementFacts`), so the page keeps only the form and this line.
 */
export function MeasurementHeader({ view, action }: { view: MeasurementView; action?: ReactNode }) {
  const { last } = view;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <dl className="m-0 flex flex-wrap items-baseline gap-x-2">
          <dt className="font-semibold">Letzte Messung</dt>
          <dd className="m-0 text-muted-foreground tabular-nums">
            {last ? measurementText(last) : "noch keine Messung"}
          </dd>
        </dl>
        {view.status === "cutting" && <Badge variant="outline">Steckling</Badge>}
      </div>
      {action}
    </div>
  );
}

/** What to measure, the rate and trend and the last assessment (US-WAC-01, US-WAC-03); derived, never stored (P-01). */
export function MeasurementFacts({ view }: { view: MeasurementView }) {
  const { last, lastRating } = view;
  return (
    <dl className="m-0 grid gap-3">
      <div>
        <dt className="font-semibold">Was messen?</dt>
        <dd className="m-0 mt-0.5 text-muted-foreground">
          {view.growthMeasure === null
            ? "Wachstumsmaß unbekannt: Wähle selbst Höhe, Rosettendurchmesser oder Trieblänge und bleib dabei."
            : `${massName(view.growthMeasure)}.`}{" "}
          Miss immer dasselbe Maß an derselben Stelle, sonst sind die Werte nicht vergleichbar.
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
