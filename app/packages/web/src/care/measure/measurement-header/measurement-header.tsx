import type { ReactNode } from "react";
import type { MeasurementView } from "@pflanzendex/core";
import { Badge } from "@/components/ui/display/badge/badge";
import { GrowthSummary } from "./growth-summary/growth-summary";
import { dateText, massName, measurementText, QUALITY_NAME } from "../../shared/text";

/**
 * The facts behind "Mehr Angaben": closed, so the page starts with the one fact line (US-WAC-01, US-QS-23). Folded, not
 * hidden: the summary names what is inside (P-10).
 */
function MoreFacts({ children }: { children: ReactNode }) {
  return (
    <details className="text-sm">
      <summary className="flex min-h-[44px] cursor-pointer items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Mehr Angaben
      </summary>
      <dl className="m-0 mt-1 grid gap-3">{children}</dl>
    </details>
  );
}

/**
 * What to measure, last measurement and last rating (US-WAC-01); derived, never stored (P-01). The page shows one fact
 * line, the last measurement with its value and date, and a cutting is marked beside it; the other facts are folded.
 */
export function MeasurementHeader({ view }: { view: MeasurementView }) {
  const { last, lastRating } = view;
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <dl className="m-0 flex flex-wrap items-baseline gap-x-2">
          <dt className="font-semibold">Letzte Messung</dt>
          <dd className="m-0 text-muted-foreground tabular-nums">
            {last ? measurementText(last) : "noch keine Messung"}
          </dd>
        </dl>
        {view.status === "cutting" && <Badge variant="outline">Steckling</Badge>}
      </div>
      <MoreFacts>
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
              ? [QUALITY_NAME[lastRating], dateText(last.date), last.note]
                  .filter(Boolean)
                  .join(" · ")
              : "noch keine Bewertung"}
          </dd>
        </div>
      </MoreFacts>
    </div>
  );
}
