import type { CSSProperties } from "react";
import { useCallback } from "react";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import {
  collectorProgress,
  milestoneTreeOf,
  treeTotalsOf,
  type CaughtSpecies,
  type CollectorRank as Rank,
  type PokedexTree,
  type TreeTotals,
} from "@pflanzendex/core";
import { SCREEN_STALE_TIME, useRequest } from "../../shared/data";
import { MilestonesOpener } from "../milestones/milestones";
import { loadTree, TREE_KEY } from "./tree-api";
import table from "./collector-rank.de.json";

export const PROGRESS_LAYER = "progress";

const ui = texts(table);

/** The text key of each rank: the keys of a message table are camelCase (FR-QG-26). */
const RANK_KEY: Record<Rank, keyof typeof table> = {
  seedling: "seedling",
  sapling: "sapling",
  young_plant: "youngPlant",
  bloomer: "bloomer",
  treetop: "treetop",
  botanist: "botanist",
};
const rankText = (rank: Rank) => ui(RANK_KEY[rank]);

/** Species caught outside the tree: named as not counted yet, so they do not vanish (US-POK-10, P-10). */
const notInTree = (count: number) =>
  count === 1 ? ui("notInTreeOne") : ui("notInTreeMany", { count });

/**
 * Collector rank and progress (US-POK-10), derived from the number of caught species. With a tree the rank and "N / M"
 * count the caught species of the tree (owner decision 2026-11-07); totals and orders come from the tree (US-POK-03).
 * While it does not exist they show as unknown (P-08, P-10).
 */
export function CollectorRank(props: { caught: number; tree?: TreeTotals | null }) {
  const p = collectorProgress(props.caught, props.tree ?? null);
  const { species, orders } = p;
  const total = species.total === null ? ui("unknown") : String(species.total);
  const count =
    species.percent === null
      ? ui("countWithoutPercent", { caught: species.caught, total })
      : ui("countWithPercent", { caught: species.caught, total, percent: species.percent });
  return (
    <section aria-label={ui("sectionLabel")} className="mb-3 grid gap-1 rounded-lg border p-3">
      <p className="text-lg font-semibold">{rankText(p.rank)}</p>
      <p>{count}</p>
      {p.notInTree !== null && p.notInTree > 0 ? <p>{notInTree(p.notInTree)}</p> : null}
      {p.next ? (
        <>
          <div
            role="progressbar"
            aria-label={ui("progressTo", { rank: rankText(p.next.rank) })}
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
          <p>{ui("remaining", { remaining: p.next.remaining, rank: rankText(p.next.rank) })}</p>
        </>
      ) : (
        <p>{ui("topRank")}</p>
      )}
      <p>
        {orders.total === null || orders.discovered === null
          ? ui("ordersUnknown")
          : ui("orders", { discovered: orders.discovered, total: orders.total })}
      </p>
      {p.treeState === "missing" && <p className="text-sm">{ui("treeMissing")}</p>}
    </section>
  );
}

/**
 * The progress as one row (US-QS-22): the rank and the caught species; the total only when the tree knows it, otherwise
 * one line says that it follows (P-08). Species that do not count yet are named here, so they do not vanish (P-10).
 * The row opens the layer "Fortschritt" with the bar, the orders and the way to the milestones.
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
      ? ui("rowCaught", { caught: props.caught })
      : ui("rowOfTotal", { caught: species.caught, total: species.total });
  const uncounted =
    props.uncounted === 0
      ? ""
      : ` · ${props.uncounted === 1 ? ui("uncountedOne") : ui("uncountedMany", { count: props.uncounted })}`;
  return (
    <LayerOpener
      id={PROGRESS_LAYER}
      className="h-auto min-h-11 w-full justify-start gap-0 whitespace-normal py-1 text-left"
    >
      <span className="font-semibold">{`${rankText(p.rank)} · ${caught}${uncounted}`}</span>
    </LayerOpener>
  );
}

/** The keys of the caught species, as the tree totals count them (US-POK-10). */
const caughtKeys = (caught: readonly CaughtSpecies[]) => new Set(caught.map((c) => c.species));

/**
 * The progress row (US-QS-22) with the totals of the tree once it is there (US-POK-10). Until then, or when the tree
 * cannot be read, the row names the caught count alone and the layer says why (P-08, P-10). Same copy as the layer.
 */
export function ProgressLine(props: {
  api: string;
  token: () => Promise<string | undefined>;
  caught: readonly CaughtSpecies[];
  uncounted: number;
}) {
  const { api, token, caught, uncounted } = props;
  const load = useCallback((t: string) => loadTree(api, t), [api]);
  const tree = useRequest({ queryKey: TREE_KEY, token, load, staleTime: SCREEN_STALE_TIME });
  const totals =
    tree.status === "ready" && tree.value
      ? treeTotalsOf(tree.value.species, caughtKeys(caught))
      : null;
  return <ProgressRow caught={caught.length} uncounted={uncounted} tree={totals} />;
}

/**
 * The rank of the tree and the opener of the milestones (US-POK-10, US-POK-11); `null` = the tree is not built yet
 * (P-08). The milestones themselves are their own layer.
 */
export function ProgressDetail(props: {
  caught: readonly CaughtSpecies[];
  tree: PokedexTree | null;
}) {
  const { caught, tree } = props;
  return (
    <>
      <CollectorRank
        caught={caught.length}
        tree={tree ? treeTotalsOf(tree.species, caughtKeys(caught)) : null}
      />
      <MilestonesOpener caught={caught} tree={tree ? milestoneTreeOf(tree.species) : null} />
    </>
  );
}
