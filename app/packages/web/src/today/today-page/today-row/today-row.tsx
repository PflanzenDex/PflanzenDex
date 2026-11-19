import type { ReactNode } from "react";
import type { TodayItem, TodayKind, TodayTarget } from "@pflanzendex/core";
import { cn } from "@/shared/lib/utils";
import { keepTogether, overdueChip, withoutOverdue } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { viewAddress, type LinkTarget } from "@/shared/patterns/navigation/navigation/navigation";
import table from "../../today.de.json";

const t = texts(table);

/** Where an action leads: the app wires the destination to a view (the modules do not know each other). */
export type TodayDestination = TodayTarget | "collection";

/**
 * The view each destination opens. A row of "Heute" that opens a view is a link to its address (US-QS-32, SG-TOUCH-02);
 * the app's `open` uses the same view. Treatments and hints are no entry: they open their layer in place, because a layer
 * needs the element that opened it, so the focus returns to the row when the layer closes (US-QS-15).
 */
export const VIEW_OF: Partial<Record<TodayDestination, LinkTarget>> = {
  care_phases: "carePhases",
  collection: "collection",
  // Measuring and the wishlist live in the Sammlung (US-QS-14, US-QS-04).
  measurements: "collection",
  wishlist: "collection",
  equipment: "collection",
};

/** The text of each kind as the state chip of its row (US-QS-18). */
const KIND: Record<TodayKind, Parameters<typeof t>[0]> = {
  treatment_overdue: "kind.treatmentOverdue",
  treatment_due: "kind.treatmentDue",
  phase_deviation: "kind.phaseDeviation",
  measurement_etiolated: "kind.measurementEtiolated",
  specimen_incomplete: "kind.specimenIncomplete",
  buffer_low: "kind.bufferLow",
  equipment_check_due: "kind.equipmentCheckDue",
};

// Flat like every row of a page (US-QS-32, SG-SHAPE-05): the card colour, no shadow in the flow of the page.
const CARD = "min-w-0 rounded-card bg-card p-3 text-card-foreground [overflow-wrap:anywhere]";
const URGENT = "border-warning-border bg-warning text-warning-foreground";
export const isTreatment = (item: TodayItem) =>
  item.kind === "treatment_overdue" || item.kind === "treatment_due";

/** The state as a short chip ("10 Tage überfällig"), never a repeated heading and sentence (US-QS-18). */
function chipOf(item: TodayItem): string {
  return (item.kind === "treatment_overdue" ? overdueChip(item.text) : null) ?? t(KIND[item.kind]);
}

/** The one line under the chip: the item's text without the overdue part the chip already says (US-QS-32). */
function lineOf(item: TodayItem): string {
  return keepTogether(item.kind === "treatment_overdue" ? withoutOverdue(item.text) : item.text);
}

/**
 * One item as a row of "Heute" (US-QS-18, US-QS-32): the state as its title, one meta line with the item's text, and the
 * whole row as its target. A row that opens a view is a link with a chevron; one that opens its layer is a button with a
 * chevron (`haspopup` dialog). The accessible name is the visible text in its order. `date` is shown only for the most
 * urgent item. `action` replaces the row by the one "Behandlungen" entry of a most urgent treatment (US-QS-18).
 */
export function TodayRow(props: {
  item: TodayItem;
  date?: string;
  onOpen: (d: TodayDestination) => void;
  /** Replaces the row: the one "Behandlungen" entry on a most urgent treatment (US-QS-18). */
  action?: ReactNode;
  /** The row is one of a list of its own (a pager's list wraps it), so it is no list item of its own. */
  bare?: boolean;
}) {
  const { item } = props;
  if (props.action) {
    return (
      <div className={cn(CARD, "flex flex-wrap items-center gap-3", isTreatment(item) && URGENT)}>
        <div className="flex min-w-0 grow basis-36 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <p className="w-fit rounded-control border border-current px-2 text-sm font-semibold tabular-nums">
              {chipOf(item)}
            </p>
            {props.date && <p className="text-xs opacity-80">{t("stand", { date: props.date })}</p>}
          </div>
          <p className="line-clamp-2 text-sm">{lineOf(item)}</p>
        </div>
        {props.action}
      </div>
    );
  }
  const view = VIEW_OF[item.target];
  const link = view === undefined ? undefined : viewAddress(view);
  return (
    <GroupedRow
      {...(props.bare ? { bare: true } : {})}
      {...(link !== undefined
        ? { to: link }
        : { onClick: () => props.onOpen(item.target), haspopup: "dialog" as const })}
      title={chipOf(item)}
      meta={lineOf(item)}
      {...(props.date !== undefined ? { trailing: t("stand", { date: props.date }) } : {})}
    />
  );
}
