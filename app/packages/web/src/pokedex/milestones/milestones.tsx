import type { CSSProperties } from "react";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { texts } from "@/shared/lib/text-rules/texts";
import {
  milestoneOverview,
  milestones,
  type CaughtSpecies,
  type Milestone,
  type MilestoneTree,
} from "@pflanzendex/core";
import table from "./milestones.de.json";

const ui = texts(table);

/** The layer that holds the milestones, opened from the progress layer (US-POK-11). */
export const MILESTONES_LAYER = "milestones";
/** Open milestones per page: two, so the layer fits one screen at 360 x 640 (DS-58, starting value, assumption). */
const PAGE_SIZE = 2;

const label = (m: Milestone) => (m.title === "" ? ui(m.level) : `${m.title}: ${ui(m.level)}`);
const named = (s: { latin: string; german: string | null }) =>
  s.german === null ? s.latin : `${s.german} (${s.latin})`;

/** The milestones of the tree with the catch date of each species (US-POK-11). */
function overviewOf(caught: readonly CaughtSpecies[], tree: MilestoneTree) {
  const dates = new Map(caught.map((c) => [c.species, c.caughtDate.date]));
  return milestoneOverview(milestones(tree, dates));
}

/**
 * The opener of the layer "Meilensteine" in the progress layer (US-POK-11). Without the tree, or without any milestone,
 * the place says why instead (P-08, P-09). When every milestone is reached the opener stays, so the reached ones remain
 * reachable (P-10).
 */
export function MilestonesOpener(props: {
  caught: readonly CaughtSpecies[];
  tree: MilestoneTree | null;
}) {
  if (!props.tree) return <p className="text-sm">{ui("needTree")}</p>;
  const { open, reached } = overviewOf(props.caught, props.tree);
  if (open.length + reached.length === 0) return <p>{ui("none")}</p>;
  return <LayerOpener id={MILESTONES_LAYER}>{ui("opener")}</LayerOpener>;
}

function Open(props: { milestone: Milestone }) {
  const m = props.milestone;
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <span className="font-semibold">{label(m)}</span>
      <div
        role="progressbar"
        aria-label={ui("progressOf", { name: label(m) })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((m.current / m.target) * 100)}
        className="h-2 overflow-hidden rounded bg-muted"
      >
        <span
          className="block h-full w-[calc(var(--value)*1%)] bg-primary"
          style={{ "--value": (m.current / m.target) * 100 } as CSSProperties}
        />
      </div>
      <span>
        {ui("remaining", { remaining: m.remaining, missing: m.missing.map(named).join(", ") })}
      </span>
    </div>
  );
}

/**
 * Milestones with an instruction for action (US-POK-11), in their own layer: the open ones paged two per page, the reached
 * ones collapsed with their date. Derived from the caught species and the taxonomy tree (US-POK-03); without the tree there
 * are no targets, so the section says so (P-08, P-10).
 */
export function Milestones(props: {
  caught: readonly CaughtSpecies[];
  tree?: MilestoneTree | null;
}) {
  if (!props.tree) return <p className="text-sm">{ui("needTree")}</p>;
  const { open, reached } = overviewOf(props.caught, props.tree);
  return (
    <section aria-label={ui("sectionLabel")} className="grid gap-3">
      {open.length > 0 ? (
        <Pager
          items={open}
          pageSize={PAGE_SIZE}
          label={ui("openList")}
          param={LAYER_PARAM}
          getKey={(m) => m.id}
          renderItem={(m) => <Open milestone={m} />}
        />
      ) : (
        <p>{ui("none")}</p>
      )}
      {reached.length > 0 && (
        <details>
          <summary>
            {reached.length === 1 ? ui("reachedOne") : ui("reachedMany", { count: reached.length })}
          </summary>
          <ul className="grid gap-1 pt-2">
            {reached.map((m) => (
              <li key={m.id}>{m.reachedOn ? `${label(m)} (${m.reachedOn})` : label(m)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
