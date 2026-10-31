import type { CSSProperties } from "react";
import { LayerOpener } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { collectorProgress, type CollectorRank as Rank, type TreeTotals } from "@pflanzendex/core";

export const PROGRESS_LAYER = "progress";

const NAME: Record<Rank, string> = {
  seedling: "Keimling",
  sapling: "Setzling",
  young_plant: "Jungpflanze",
  bloomer: "Blüher",
  treetop: "Baumkrone",
  botanist: "Botaniker",
};

/**
 * Collector rank and progress (US-POK-10), derived from the number of caught species. Totals and orders come from the
 * taxonomy tree (US-POK-03); while it does not exist they show as unknown (P-08, P-10).
 */
export function CollectorRank(props: { caught: number; tree?: TreeTotals | null }) {
  const p = collectorProgress(props.caught, props.tree ?? null);
  const { species, orders } = p;
  const total = species.total === null ? "unbekannt" : String(species.total);
  const percent = species.percent === null ? "" : ` (${species.percent} %)`;
  return (
    <section aria-label="Sammlerrang" className="mb-3 grid gap-1 rounded-lg border p-3">
      <p className="text-lg font-semibold">{NAME[p.rank]}</p>
      <p>{`${species.caught} / ${total} Arten gefangen${percent}`}</p>
      {p.next ? (
        <>
          <div
            role="progressbar"
            aria-label={`Fortschritt bis ${NAME[p.next.rank]}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p.fraction * 100)}
            className="h-2 overflow-hidden rounded bg-muted"
          >
            <span
              className="block h-full w-[calc(var(--value)*1%)] bg-primary"
              style={{ "--value": p.fraction * 100 } as CSSProperties}
            />
          </div>
          <p>{`Noch ${p.next.remaining} bis „${NAME[p.next.rank]}“`}</p>
        </>
      ) : (
        <p>Höchster Rang erreicht</p>
      )}
      <p>
        {orders.total === null
          ? "Ordnungen: unbekannt"
          : `${orders.discovered} von ${orders.total} Ordnungen entdeckt`}
      </p>
      {p.treeState === "missing" && (
        <p className="text-sm">
          Der Baum der Arten ist noch nicht aufgebaut, darum fehlen Gesamtzahl und Ordnungen.
        </p>
      )}
    </section>
  );
}

/**
 * The progress as one row (US-QS-22): the rank and the caught species; the total only when the tree knows it, otherwise
 * one line says that it follows (P-08). Species that do not count yet are named here, so they do not vanish (P-10).
 * The row opens the layer "Fortschritt" with the bar, the orders and the milestones.
 */
export function ProgressRow(props: {
  caught: number;
  uncounted: number;
  tree?: TreeTotals | null;
}) {
  const p = collectorProgress(props.caught, props.tree ?? null);
  const { species } = p;
  // One line (US-QS-22): the total only when the tree knows it; why it is unknown and the bar are in the layer.
  const caught =
    species.total === null
      ? `${props.caught} gefangen`
      : `${species.caught} von ${species.total} Arten`;
  const uncounted =
    props.uncounted === 0
      ? ""
      : ` · ${props.uncounted} ${props.uncounted === 1 ? "Pflanze zählt" : "Pflanzen zählen"} noch nicht`;
  return (
    <LayerOpener
      id={PROGRESS_LAYER}
      className="h-auto min-h-11 w-full justify-start gap-0 whitespace-normal py-1 text-left"
    >
      <span className="font-semibold">{`${NAME[p.rank]} · ${caught}${uncounted}`}</span>
    </LayerOpener>
  );
}
